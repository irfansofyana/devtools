import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Excalidraw,
    convertToExcalidrawElements,
    exportToBlob,
    exportToSvg,
    loadFromBlob,
    loadLibraryFromBlob,
    mergeLibraryItems,
    serializeAsJSON,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { strToU8, zipSync } from 'fflate';

import { createArtifactFiles, createWorkspaceBackup, validateWorkspaceBackup } from './domain/artifacts.js';
import { createBoard, normalizeBoardName, sortBoardsByUpdatedAt } from './domain/boards.js';
import { componentPacks, deferredCloudPacks } from './domain/component-packs.js';
import { layoutSelectedElements } from './domain/layout.js';
import { templateToSkeletons } from './domain/template-elements.js';
import { getTemplate, templateCatalog } from './domain/templates.js';
import { createWorkspaceOperationCoordinator } from './domain/workspace-operations.js';
import {
    deleteBoard,
    getSetting,
    listBoards,
    loadScene,
    loadWorkspaceScenes,
    replaceWorkspace,
    saveBoard,
    setSetting,
} from './storage/workspace-db.js';
import { downloadBlob, safeFilename } from './utils/download.js';

const AUTOSAVE_DELAY = 700;
const EMPTY_FILES = {};
const MAX_MERMAID_CHARACTERS = 20_000;
const rejectRemoteEmbeddable = () => false;
const renderLocalOnlyEmbeddable = () => null;

function blankScene(theme = 'light') {
    return {
        type: 'excalidraw',
        version: 2,
        source: window.location.origin,
        elements: [],
        appState: {
            theme,
            viewBackgroundColor: theme === 'dark' ? '#111513' : '#f7f7f3',
            gridSize: 20,
        },
        files: {},
    };
}

function Modal({ title, description, onClose, children, busy = false }) {
    const closeRef = useRef(null);
    const panelRef = useRef(null);

    useEffect(() => {
        const previousFocus = document.activeElement;
        closeRef.current?.focus();
        const handleKey = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = [...panelRef.current.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('keydown', handleKey);
            previousFocus?.focus?.();
        };
    }, [onClose]);

    return (
        <div className="modal-backdrop" role="presentation" inert={busy ? '' : undefined} aria-busy={busy || undefined} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <section ref={panelRef} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby={description ? 'modal-description' : undefined}>
                <header className="modal-header">
                    <div>
                        <h2 id="modal-title">{title}</h2>
                        {description && <p id="modal-description">{description}</p>}
                    </div>
                    <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label={`Close ${title}`}>×</button>
                </header>
                <div className="modal-body">{children}</div>
            </section>
        </div>
    );
}

function App() {
    const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
    const [boards, setBoards] = useState([]);
    const [currentBoard, setCurrentBoard] = useState(null);
    const [initialData, setInitialData] = useState(null);
    const [editorKey, setEditorKey] = useState(0);
    const [editor, setEditor] = useState(null);
    const [saveState, setSaveState] = useState('Loading local workspace…');
    const [panel, setPanel] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 920px)').matches);
    const [installedPacks, setInstalledPacks] = useState([]);
    const [packLoading, setPackLoading] = useState(null);
    const [mermaidText, setMermaidText] = useState('flowchart TD\n    Client --> API\n    API --> Cache\n    API --> Database');
    const [mermaidError, setMermaidError] = useState('');
    const [storagePersistent, setStoragePersistent] = useState(null);
    const [workspaceBusy, setWorkspaceBusy] = useState(false);
    const importInputRef = useRef(null);
    const workspaceInputRef = useRef(null);
    const sidebarToggleRef = useRef(null);
    const sidebarRef = useRef(null);
    const pendingSidebarFocusRef = useRef(false);
    const latestSceneRef = useRef(null);
    const currentBoardRef = useRef(null);
    const saveTimerRef = useRef(null);
    const saveQueueRef = useRef(Promise.resolve());
    const saveRevisionRef = useRef(0);
    const savedRevisionRef = useRef(0);
    const mountedRef = useRef(true);
    const operationCoordinatorRef = useRef(null);
    if (!operationCoordinatorRef.current) {
        operationCoordinatorRef.current = createWorkspaceOperationCoordinator({
            onStart: () => {
                if (saveTimerRef.current) {
                    window.clearTimeout(saveTimerRef.current);
                    saveTimerRef.current = null;
                }
                if (mountedRef.current) setWorkspaceBusy(true);
            },
            onFinish: () => {
                if (mountedRef.current) setWorkspaceBusy(false);
                if (pendingSidebarFocusRef.current) {
                    pendingSidebarFocusRef.current = false;
                    window.requestAnimationFrame(() => sidebarToggleRef.current?.focus());
                }
            },
        });
    }

    useEffect(() => {
        currentBoardRef.current = currentBoard;
    }, [currentBoard]);

    const closePanel = useCallback(() => setPanel(null), []);
    const closeSidebar = useCallback((restoreFocus = true) => {
        if (restoreFocus && window.matchMedia('(max-width: 920px)').matches) {
            if (operationCoordinatorRef.current.isActive() || sidebarToggleRef.current?.disabled) {
                pendingSidebarFocusRef.current = true;
            } else {
                sidebarToggleRef.current?.focus();
            }
        }
        setSidebarOpen(false);
    }, []);

    useEffect(() => {
        const compactViewport = window.matchMedia('(max-width: 920px)');
        const handleViewportChange = (event) => setSidebarOpen(!event.matches);
        compactViewport.addEventListener('change', handleViewportChange);
        return () => compactViewport.removeEventListener('change', handleViewportChange);
    }, []);

    useEffect(() => {
        if (!sidebarOpen || !window.matchMedia('(max-width: 920px)').matches) return undefined;
        window.requestAnimationFrame(() => sidebarRef.current?.querySelector('button')?.focus());
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeSidebar(true);
            }
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [closeSidebar, sidebarOpen]);

    const saveSnapshot = useCallback(async (board, snapshot, revision) => {
        if (!board || !snapshot) return;
        if (mountedRef.current) setSaveState('Saving locally…');
        try {
            const updatedBoard = { ...board, updatedAt: Date.now() };
            const json = serializeAsJSON(snapshot.elements, snapshot.appState, snapshot.files, 'local');
            await saveBoard(updatedBoard, json);
            savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
            if (mountedRef.current) {
                setBoards((items) => sortBoardsByUpdatedAt(items.map((item) => item.id === updatedBoard.id ? { ...item, updatedAt: updatedBoard.updatedAt } : item)));
                if (currentBoardRef.current?.id === updatedBoard.id) {
                    const current = { ...currentBoardRef.current, updatedAt: updatedBoard.updatedAt };
                    currentBoardRef.current = current;
                    setCurrentBoard(current);
                    if (latestSceneRef.current === snapshot && savedRevisionRef.current >= saveRevisionRef.current) {
                        setSaveState('Saved locally');
                    }
                }
            }
            return updatedBoard;
        } catch (error) {
            console.error('Local diagram save failed', error);
            if (mountedRef.current) setSaveState('Local save failed — export before leaving');
            throw error;
        }
    }, []);

    const queueSave = useCallback((board, snapshot, revision) => {
        const operation = saveQueueRef.current
            .catch(() => undefined)
            .then(() => saveSnapshot(board, snapshot, revision));
        saveQueueRef.current = operation;
        return operation;
    }, [saveSnapshot]);

    const flushSave = useCallback(async () => {
        if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        await saveQueueRef.current.catch(() => undefined);
        while (savedRevisionRef.current < saveRevisionRef.current) {
            const board = currentBoardRef.current;
            const snapshot = latestSceneRef.current;
            if (!board || !snapshot) throw new Error('No active local board is available to save.');
            const revision = saveRevisionRef.current;
            await queueSave(board, snapshot, revision);
        }
    }, [queueSave]);

    const runWorkspaceOperation = useCallback((label, operation) => (
        operationCoordinatorRef.current.run(label, async (token) => {
            try {
                await flushSave();
            } catch (error) {
                throw new Error('Pending local changes could not be saved.', { cause: error });
            }
            return operation(token);
        })
    ), [flushSave]);

    const persistLatestOnExit = useCallback(() => {
        if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        const board = currentBoardRef.current;
        const snapshot = latestSceneRef.current;
        if (!board || !snapshot || savedRevisionRef.current >= saveRevisionRef.current) return;
        const revision = saveRevisionRef.current;
        queueSave(board, snapshot, revision)
            .catch((error) => console.error('Final local diagram save failed', error));
    }, [queueSave]);

    useEffect(() => {
        mountedRef.current = true;
        const handlePageHide = () => persistLatestOnExit();
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') persistLatestOnExit();
        };
        window.addEventListener('pagehide', handlePageHide);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('pagehide', handlePageHide);
            document.removeEventListener('visibilitychange', handleVisibility);
            persistLatestOnExit();
            mountedRef.current = false;
        };
    }, [persistLatestOnExit]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                let availableBoards = await listBoards();
                const preferredId = await getSetting('current-board-id');
                const savedLibrary = await getSetting('library-items', []);
                const savedPacks = await getSetting('installed-packs', []);
                let board = availableBoards.find(({ id }) => id === preferredId) ?? availableBoards[0];

                if (!board) {
                    board = createBoard({ id: crypto.randomUUID(), name: 'Untitled diagram' });
                    const scene = blankScene(theme);
                    await saveBoard(board, JSON.stringify(scene));
                    availableBoards = [board];
                }

                const scene = (await loadScene(board.id)) ?? blankScene(theme);
                scene.libraryItems = savedLibrary;
                if (!active) return;
                setBoards(availableBoards);
                setInstalledPacks(savedPacks);
                currentBoardRef.current = board;
                setCurrentBoard(board);
                setInitialData(scene);
                latestSceneRef.current = {
                    elements: scene.elements ?? [],
                    appState: scene.appState ?? {},
                    files: scene.files ?? {},
                };
                setSaveState('Saved locally');
                if (navigator.storage?.persisted) setStoragePersistent(await navigator.storage.persisted());
            } catch (error) {
                console.error('Could not open local diagram workspace', error);
                if (!active) return;
                const fallbackBoard = createBoard({ id: crypto.randomUUID(), name: 'Unsaved diagram' });
                setBoards([fallbackBoard]);
                currentBoardRef.current = fallbackBoard;
                setCurrentBoard(fallbackBoard);
                setInitialData(blankScene(theme));
                setSaveState('Browser storage unavailable — export your work');
            }
        })();
        return () => { active = false; };
    }, []);

    const handleChange = useCallback((elements, appState, files) => {
        if (operationCoordinatorRef.current.isActive()) return;
        const snapshot = { elements, appState, files };
        const revision = saveRevisionRef.current + 1;
        saveRevisionRef.current = revision;
        latestSceneRef.current = snapshot;
        setSaveState('Unsaved changes');
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        const board = currentBoardRef.current;
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null;
            queueSave(board, snapshot, revision).catch(() => undefined);
        }, AUTOSAVE_DELAY);
    }, [queueSave]);

    const activateBoard = useCallback((board, scene, libraryItems = [], status = 'Saved locally') => {
        latestSceneRef.current = {
            elements: scene.elements ?? [],
            appState: scene.appState ?? {},
            files: scene.files ?? {},
        };
        saveRevisionRef.current = 0;
        savedRevisionRef.current = 0;
        currentBoardRef.current = board;
        setCurrentBoard(board);
        setInitialData({ ...scene, libraryItems });
        setEditor(null);
        setEditorKey((value) => value + 1);
        setPanel(null);
        setSaveState(status);
        if (window.matchMedia('(max-width: 920px)').matches) closeSidebar(true);
    }, [closeSidebar]);

    const loadAndActivateBoard = useCallback(async (board) => {
        const scene = (await loadScene(board.id)) ?? blankScene(theme);
        let settingsAvailable = true;
        let libraryItems = [];
        try {
            libraryItems = await getSetting('library-items', []);
            await setSetting('current-board-id', board.id);
        } catch (error) {
            settingsAvailable = false;
            console.error('Diagram workspace settings unavailable', error);
        }
        activateBoard(board, scene, libraryItems, settingsAvailable ? 'Saved locally' : 'Board opened; current-board preference unavailable');
        return board;
    }, [activateBoard, theme]);

    const createAndActivateBoard = useCallback(async (name = 'Untitled diagram', scene = blankScene(theme)) => {
        const board = createBoard({ id: crypto.randomUUID(), name });
        await saveBoard(board, JSON.stringify(scene));
        let settingsAvailable = true;
        let libraryItems = [];
        try {
            await setSetting('current-board-id', board.id);
            libraryItems = await getSetting('library-items', []);
        } catch (error) {
            settingsAvailable = false;
            console.error('Diagram workspace settings unavailable', error);
        }
        setBoards((items) => sortBoardsByUpdatedAt([...items, board]));
        activateBoard(board, scene, libraryItems, settingsAvailable ? 'Saved locally' : 'Board saved; current-board preference unavailable');
        return board;
    }, [activateBoard, theme]);

    const openBoard = useCallback(async (board) => {
        if (board.id === currentBoardRef.current?.id || operationCoordinatorRef.current.isActive()) return null;
        try {
            const result = await runWorkspaceOperation('open-board', () => loadAndActivateBoard(board));
            return result.accepted ? result.value : null;
        } catch (error) {
            console.error('Local diagram open failed', error);
            setSaveState('Could not open that local board — export a workspace backup');
            return null;
        }
    }, [loadAndActivateBoard, runWorkspaceOperation]);

    const createNewBoard = useCallback(async (name = 'Untitled diagram', scene = blankScene(theme)) => {
        if (operationCoordinatorRef.current.isActive()) return null;
        try {
            const result = await runWorkspaceOperation('create-board', () => createAndActivateBoard(name, scene));
            return result.accepted ? result.value : null;
        } catch (error) {
            console.error('Local diagram creation failed', error);
            setSaveState('Could not create a local board — export a workspace backup');
            return null;
        }
    }, [createAndActivateBoard, runWorkspaceOperation, theme]);

    const renameCurrentBoard = useCallback(async (event) => {
        const name = normalizeBoardName(event.currentTarget.value);
        event.currentTarget.value = name;
        const board = { ...currentBoardRef.current, name, updatedAt: Date.now() };
        if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        saveRevisionRef.current += 1;
        currentBoardRef.current = board;
        setCurrentBoard(board);
        setBoards((items) => sortBoardsByUpdatedAt(items.map((item) => item.id === board.id ? board : item)));
        try {
            await flushSave();
        } catch (_) {
            // saveSnapshot already surfaced the actionable storage error.
        }
    }, [flushSave]);

    const removeCurrentBoard = useCallback(async () => {
        if (!currentBoard || operationCoordinatorRef.current.isActive()
            || !window.confirm(`Delete “${currentBoard.name}” from this browser? This cannot be undone.`)) return;
        try {
            await runWorkspaceOperation('delete-board', async () => {
                const remaining = boards.filter(({ id }) => id !== currentBoard.id);
                await deleteBoard(currentBoard.id);
                if (remaining.length) {
                    setBoards(remaining);
                    await loadAndActivateBoard(remaining[0]);
                } else {
                    setBoards([]);
                    await createAndActivateBoard();
                }
            });
        } catch (error) {
            console.error('Local diagram deletion failed', error);
            setSaveState('Delete stopped because local changes could not be saved');
        }
    }, [boards, createAndActivateBoard, currentBoard, loadAndActivateBoard, runWorkspaceOperation]);

    const applyTemplate = useCallback(async (templateId) => {
        try {
            const template = getTemplate(templateId);
            const elements = convertToExcalidrawElements(templateToSkeletons(template), { regenerateIds: false });
            const scene = blankScene(theme);
            scene.elements = elements;
            scene.appState.scrollToContent = true;
            await createNewBoard(template.name, scene);
        } catch (error) {
            console.error('Template creation failed', error);
            setSaveState('Template failed to load');
        }
    }, [createNewBoard, theme]);

    const createFromMermaid = useCallback(async () => {
        setMermaidError('');
        const preparationToken = operationCoordinatorRef.current.currentToken();
        if (operationCoordinatorRef.current.isActive()) return;
        try {
            if (!mermaidText.trim()) throw new Error('Paste Mermaid source first.');
            if (mermaidText.length > MAX_MERMAID_CHARACTERS) throw new Error('Mermaid source is limited to 20,000 characters.');
            const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw');
            const result = await parseMermaidToExcalidraw(mermaidText.trim());
            if (operationCoordinatorRef.current.isActive()
                || operationCoordinatorRef.current.currentToken() !== preparationToken) {
                throw new Error('The workspace changed during conversion. Run Mermaid conversion again.');
            }
            const elements = convertToExcalidrawElements(result.elements, { regenerateIds: true });
            const scene = blankScene(theme);
            scene.elements = elements;
            scene.files = result.files ?? {};
            scene.appState.scrollToContent = true;
            await createNewBoard('Mermaid diagram', scene);
        } catch (error) {
            console.error('Mermaid conversion failed', error);
            setMermaidError(error?.message || 'Could not parse this Mermaid diagram.');
        }
    }, [createNewBoard, mermaidText, theme]);

    const arrangeSelection = useCallback(() => {
        if (!editor) return;
        try {
            const selectedIds = editor.getAppState().selectedElementIds;
            const elements = layoutSelectedElements(editor.getSceneElements(), selectedIds);
            editor.updateScene({ elements });
            editor.scrollToContent(elements.filter(({ id }) => selectedIds[id]));
            setSaveState('Selection arranged');
        } catch (error) {
            setSaveState(error.message);
        }
    }, [editor]);

    const installPack = useCallback(async (pack) => {
        if (!editor || packLoading || operationCoordinatorRef.current.isActive()) return;
        const preparationToken = operationCoordinatorRef.current.currentToken();
        setPackLoading(pack.id);
        try {
            const response = await fetch(`${import.meta.env.BASE_URL}${pack.source}`);
            if (!response.ok) throw new Error(`Component pack request failed (${response.status})`);
            const items = await loadLibraryFromBlob(await response.blob(), 'published');
            if (operationCoordinatorRef.current.isActive()
                || operationCoordinatorRef.current.currentToken() !== preparationToken) {
                throw new Error('The workspace changed during component loading.');
            }
            const result = await runWorkspaceOperation('install-component-pack', async () => {
                const existingItems = await getSetting('library-items', []);
                const mergedItems = mergeLibraryItems(existingItems, items);
                const next = [...new Set([...installedPacks, pack.id])];
                await editor.updateLibrary({ libraryItems: mergedItems, merge: false, openLibraryMenu: true, defaultStatus: 'published' });
                await setSetting('library-items', mergedItems);
                await setSetting('installed-packs', next);
                setInstalledPacks(next);
                setPanel(null);
                setSaveState(`${pack.name} installed locally`);
            });
            if (!result.accepted) throw new Error('Another workspace operation started first.');
        } catch (error) {
            console.error('Component pack installation failed', error);
            setSaveState(`${pack.name} could not be installed`);
        } finally {
            setPackLoading(null);
        }
    }, [editor, installedPacks, packLoading, runWorkspaceOperation]);

    const persistLibrary = useCallback(async (libraryItems) => {
        if (operationCoordinatorRef.current.isActive()) return;
        try {
            await setSetting('library-items', libraryItems);
        } catch (error) {
            console.error('Library persistence failed', error);
            setSaveState('Component library save failed');
        }
    }, []);

    const exportScene = useCallback(() => {
        const scene = latestSceneRef.current;
        if (!scene || !currentBoard) return;
        const json = serializeAsJSON(scene.elements, scene.appState, scene.files, 'local');
        downloadBlob(new Blob([json], { type: 'application/vnd.excalidraw+json' }), safeFilename(currentBoard.name, 'excalidraw'));
    }, [currentBoard]);

    const exportImage = useCallback(async (format) => {
        if (!editor || !currentBoard || operationCoordinatorRef.current.isActive()) return;
        try {
            const result = await runWorkspaceOperation(`export-${format}`, async () => {
                const elements = editor.getSceneElements();
                if (!elements.length) throw new Error('Add something before exporting an image.');
                const appState = editor.getAppState();
                const files = editor.getFiles();
                if (format === 'png') {
                    const blob = await exportToBlob({ elements, appState, files, mimeType: 'image/png', exportPadding: 24 });
                    downloadBlob(blob, safeFilename(currentBoard.name, 'png'));
                } else {
                    const svg = await exportToSvg({ elements, appState, files, exportPadding: 24 });
                    downloadBlob(new Blob([svg.outerHTML], { type: 'image/svg+xml' }), safeFilename(currentBoard.name, 'svg'));
                }
                setSaveState(`Exported ${format.toUpperCase()}`);
            });
            if (!result.accepted) return;
        } catch (error) {
            console.error('Image export failed', error);
            setSaveState(error?.message?.startsWith('Add something') ? error.message : `${format.toUpperCase()} export failed`);
        }
    }, [currentBoard, editor, runWorkspaceOperation]);

    const exportArtifactPack = useCallback(async () => {
        if (!editor || !currentBoard || operationCoordinatorRef.current.isActive()) return;
        try {
            const result = await runWorkspaceOperation('export-documentation-pack', async () => {
                const elements = editor.getSceneElements();
                if (!elements.length) throw new Error('Add something before exporting an artifact pack.');
                setSaveState('Building documentation pack…');
                const appState = editor.getAppState();
                const files = editor.getFiles();
                const sceneJson = serializeAsJSON(elements, appState, files, 'local');
                const [pngBlob, svg] = await Promise.all([
                    exportToBlob({ elements, appState, files, mimeType: 'image/png', exportPadding: 24 }),
                    exportToSvg({ elements, appState, files, exportPadding: 24 }),
                ]);
                const artifactFiles = createArtifactFiles({
                    name: currentBoard.name,
                    sceneJson,
                    svgText: svg.outerHTML,
                    pngBytes: new Uint8Array(await pngBlob.arrayBuffer()),
                    updatedAt: currentBoard.updatedAt,
                });
                const zipInput = Object.fromEntries(Object.entries(artifactFiles).map(([path, value]) => [
                    path,
                    typeof value === 'string' ? strToU8(value) : value,
                ]));
                const archive = zipSync(zipInput, { level: 6 });
                downloadBlob(new Blob([archive], { type: 'application/zip' }), safeFilename(currentBoard.name, 'zip'));
                setSaveState('Documentation pack exported');
            });
            if (!result.accepted) return;
        } catch (error) {
            console.error('Artifact pack export failed', error);
            setSaveState(error?.message?.startsWith('Add something') ? error.message : 'Documentation pack export failed');
        }
    }, [currentBoard, editor, runWorkspaceOperation]);

    const exportWorkspace = useCallback(async () => {
        if (operationCoordinatorRef.current.isActive()) return;
        try {
            await runWorkspaceOperation('export-workspace', async () => {
                const allBoards = await listBoards();
                const backup = createWorkspaceBackup({
                    boards: allBoards,
                    scenes: await loadWorkspaceScenes(allBoards),
                    libraryItems: await getSetting('library-items', []),
                    installedPacks: await getSetting('installed-packs', []),
                });
                downloadBlob(
                    new Blob([JSON.stringify(backup)], { type: 'application/json' }),
                    `diagram-workspace-${new Date().toISOString().slice(0, 10)}.json`,
                );
                setSaveState('Workspace backup exported');
            });
        } catch (error) {
            console.error('Workspace export failed', error);
            setSaveState('Workspace backup failed');
        }
    }, [runWorkspaceOperation]);

    const importWorkspace = useCallback(async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > 100 * 1024 * 1024) {
            setSaveState('Workspace import rejected: file exceeds 100 MiB');
            return;
        }

        let backup;
        try {
            backup = validateWorkspaceBackup(JSON.parse(await file.text()));
        } catch (error) {
            console.error('Workspace backup validation failed', error);
            setSaveState('Workspace restore failed: invalid backup');
            return;
        }
        if (!window.confirm(`Replace this browser’s ${boards.length} local board(s) with ${backup.boards.length} board(s) from the backup?`)) return;
        if (operationCoordinatorRef.current.isActive()) return;

        try {
            await runWorkspaceOperation('restore-workspace', async () => {
                const knownPacks = new Set(componentPacks.map(({ id }) => id));
                const restoredPacks = backup.installedPacks.filter((id) => knownPacks.has(id));
                await replaceWorkspace({ ...backup, installedPacks: restoredPacks });
                const firstBoard = backup.boards[0];
                const scene = backup.scenes[firstBoard.id];
                setBoards(sortBoardsByUpdatedAt(backup.boards));
                setInstalledPacks(restoredPacks);
                activateBoard(firstBoard, scene, backup.libraryItems, 'Workspace restored locally');
            });
        } catch (error) {
            console.error('Workspace import failed', error);
            setSaveState(error?.message?.includes('save')
                ? 'Restore stopped because current changes could not be saved'
                : 'Workspace restore failed; the existing workspace was not replaced');
        }
    }, [activateBoard, boards.length, runWorkspaceOperation]);

    const importScene = useCallback(async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !editor) return;
        if (file.size > 50 * 1024 * 1024) {
            setSaveState('Import rejected: file exceeds 50 MiB');
            return;
        }
        try {
            const restored = await loadFromBlob(file, editor.getAppState(), editor.getSceneElements());
            if (!restored?.elements) throw new Error('No scene elements found');
            await createNewBoard(file.name.replace(/\.excalidraw$/i, ''), {
                type: 'excalidraw',
                version: 2,
                source: window.location.origin,
                elements: restored.elements,
                appState: { ...restored.appState, scrollToContent: true },
                files: restored.files ?? {},
            });
        } catch (error) {
            console.error('Diagram import failed', error);
            setSaveState('Import failed: choose a valid .excalidraw file');
        }
    }, [createNewBoard, editor]);

    const toggleTheme = useCallback(() => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem('tools-theme', next); } catch (_) { /* storage may be unavailable */ }
    }, [theme]);

    const requestPersistentStorage = useCallback(async () => {
        if (!navigator.storage?.persist) {
            setSaveState('Persistent-storage requests are not supported here');
            return;
        }
        const granted = await navigator.storage.persist();
        setStoragePersistent(granted);
        setSaveState(granted ? 'Browser granted persistent storage' : 'Browser did not grant persistent storage');
    }, []);

    const boardCountLabel = useMemo(() => `${boards.length} local board${boards.length === 1 ? '' : 's'}`, [boards.length]);

    if (!currentBoard || !initialData) {
        return <main className="loading-screen"><strong>Diagram Workbench</strong><span>{saveState}</span></main>;
    }

    return (
        <main className={`workbench-shell ${workspaceBusy ? 'is-workspace-busy' : ''}`} aria-busy={workspaceBusy}>
            <header className="workbench-bar">
                <div className="bar-start">
                    <a className="brand-link" href="../../" aria-label="Back to tools homepage">tools.</a>
                    <button ref={sidebarToggleRef} className="icon-button mobile-only" type="button" disabled={workspaceBusy} onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle local boards" aria-expanded={sidebarOpen} aria-controls="local-board-sidebar">☰</button>
                    <input className="board-title-input" aria-label="Diagram name" disabled={workspaceBusy} defaultValue={currentBoard.name} key={currentBoard.id} onBlur={renameCurrentBoard} maxLength={80} />
                </div>
                <div className="bar-actions" aria-label="Diagram actions" inert={workspaceBusy ? '' : undefined}>
                    <span className={`save-state ${saveState.includes('failed') || saveState.includes('unavailable') ? 'is-error' : ''}`} role="status" aria-live="polite">{saveState}</span>
                    <button type="button" onClick={() => setPanel('templates')}>Templates</button>
                    <button type="button" onClick={() => setPanel('mermaid')}>Mermaid</button>
                    <button type="button" onClick={() => setPanel('packs')}>Components</button>
                    <button type="button" onClick={arrangeSelection}>Arrange</button>
                    <div className="menu-wrap">
                        <details>
                            <summary>Import</summary>
                            <div className="menu-popover">
                                <button type="button" onClick={() => importInputRef.current?.click()}>Excalidraw file</button>
                                <button type="button" onClick={() => workspaceInputRef.current?.click()}>Workspace backup</button>
                            </div>
                        </details>
                    </div>
                    <div className="menu-wrap">
                        <details>
                            <summary>Export</summary>
                            <div className="menu-popover">
                                <button type="button" onClick={exportScene}>Excalidraw file</button>
                                <button type="button" onClick={() => exportImage('png')}>PNG image</button>
                                <button type="button" onClick={() => exportImage('svg')}>SVG image</button>
                                <button type="button" onClick={exportArtifactPack}>Documentation pack</button>
                                <button type="button" onClick={exportWorkspace}>Workspace backup</button>
                            </div>
                        </details>
                    </div>
                    <div className="menu-wrap mobile-action-menu">
                        <details>
                            <summary aria-label="More diagram actions">•••</summary>
                            <div className="menu-popover">
                                <button type="button" onClick={() => setPanel('templates')}>Templates</button>
                                <button type="button" onClick={() => setPanel('mermaid')}>Mermaid to canvas</button>
                                <button type="button" onClick={() => setPanel('packs')}>Component packs</button>
                                <button type="button" onClick={arrangeSelection}>Arrange selection</button>
                                <button type="button" onClick={() => importInputRef.current?.click()}>Import diagram</button>
                                <button type="button" onClick={exportScene}>Export diagram</button>
                            </div>
                        </details>
                    </div>
                    <button className="icon-button" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? '☀' : '◐'}</button>
                    <input ref={importInputRef} className="visually-hidden" type="file" accept=".excalidraw,application/json,application/vnd.excalidraw+json" onChange={importScene} />
                    <input ref={workspaceInputRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={importWorkspace} />
                </div>
            </header>

            <div className="workbench-main">
                <button className={`sidebar-scrim ${sidebarOpen ? 'is-visible' : ''}`} type="button" disabled={!sidebarOpen || workspaceBusy} onClick={() => closeSidebar(true)} aria-label="Close local boards" aria-hidden={!sidebarOpen} tabIndex={sidebarOpen && !workspaceBusy ? 0 : -1} />
                <aside ref={sidebarRef} id="local-board-sidebar" className={`board-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Local diagram boards" aria-hidden={!sidebarOpen} inert={workspaceBusy || !sidebarOpen ? '' : undefined}>
                    <div className="sidebar-heading">
                        <div><strong>Local boards</strong><span>{boardCountLabel}</span></div>
                        <button className="icon-button" type="button" onClick={() => createNewBoard()} aria-label="Create new diagram">+</button>
                    </div>
                    <div className="board-list">
                        {boards.map((board) => (
                            <button key={board.id} type="button" className={`board-row ${board.id === currentBoard.id ? 'is-active' : ''}`} onClick={() => openBoard(board)} aria-current={board.id === currentBoard.id ? 'page' : undefined}>
                                <span>{board.name}</span>
                                <small>{new Date(board.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
                            </button>
                        ))}
                    </div>
                    <div className="storage-note">
                        <strong>Stored in this browser</strong>
                        <p>Export an Excalidraw file for a portable backup.</p>
                        {storagePersistent === false && <button type="button" className="text-button" onClick={requestPersistentStorage}>Protect local storage</button>}
                        {storagePersistent === true && <span>Persistent storage granted</span>}
                    </div>
                    <button className="delete-board-button" type="button" onClick={removeCurrentBoard}>Delete current board</button>
                </aside>

                <section className={`canvas-region ${workspaceBusy ? 'is-busy' : ''}`} id="diagram-canvas" aria-label="Diagram canvas" inert={workspaceBusy ? '' : undefined}>
                    <Excalidraw
                        key={editorKey}
                        excalidrawAPI={setEditor}
                        initialData={initialData}
                        onChange={handleChange}
                        onLibraryChange={persistLibrary}
                        validateEmbeddable={rejectRemoteEmbeddable}
                        renderEmbeddable={renderLocalOnlyEmbeddable}
                        theme={theme}
                        name={currentBoard.name}
                        autoFocus
                        UIOptions={{
                            canvasActions: {
                                loadScene: false,
                                saveToActiveFile: false,
                                toggleTheme: false,
                            },
                        }}
                    />
                </section>
            </div>

            {panel === 'templates' && (
                <Modal title="Technical templates" description="Each template opens as a new local board, so your current diagram stays untouched." onClose={closePanel} busy={workspaceBusy}>
                    <div className="template-grid">
                        {templateCatalog.map((template) => (
                            <button className="template-card" type="button" key={template.id} onClick={() => applyTemplate(template.id)}>
                                <span className="card-meta">{template.category}</span>
                                <strong>{template.name}</strong>
                                <p>{template.description}</p>
                                <small>{template.nodes.length} components</small>
                            </button>
                        ))}
                    </div>
                </Modal>
            )}

            {panel === 'mermaid' && (
                <Modal title="Mermaid to editable canvas" description="Paste Mermaid syntax. Conversion runs locally and creates a new board of editable Excalidraw elements." onClose={closePanel} busy={workspaceBusy}>
                    <div className="mermaid-form">
                        <label htmlFor="mermaid-source">Mermaid source</label>
                        <textarea id="mermaid-source" value={mermaidText} maxLength={MAX_MERMAID_CHARACTERS} onChange={(event) => setMermaidText(event.target.value)} spellCheck="false" />
                        {mermaidError && <p className="form-error" role="alert">{mermaidError}</p>}
                        <div className="modal-actions">
                            <small>Supported by the pinned Excalidraw converter: flowcharts, sequence, class, ER, and state diagrams.</small>
                            <button type="button" onClick={createFromMermaid} disabled={!mermaidText.trim()}>Create editable board</button>
                        </div>
                    </div>
                </Modal>
            )}

            {panel === 'packs' && (
                <Modal title="Component packs" description="Packs are downloaded only when installed, then retained in this browser’s Excalidraw library." onClose={closePanel} busy={workspaceBusy}>
                    <div className="pack-list">
                        {componentPacks.map((pack) => {
                            const installed = installedPacks.includes(pack.id);
                            return (
                                <article className="pack-row" key={pack.id}>
                                    <div>
                                        <span className="card-meta">{pack.category}</span>
                                        <h3>{pack.name}</h3>
                                        <p>{pack.description}</p>
                                        <small>{pack.license} · by {pack.attribution} · <a href={pack.upstream} target="_blank" rel="noopener noreferrer">source</a></small>
                                        {pack.attributionUrl && <small><a href={pack.attributionUrl} target="_blank" rel="noopener noreferrer">Attribution details</a></small>}
                                    </div>
                                    <button type="button" onClick={() => installPack(pack)} disabled={!editor || packLoading === pack.id}>
                                        {packLoading === pack.id ? 'Installing…' : installed ? 'Install again' : 'Install'}
                                    </button>
                                </article>
                            );
                        })}
                    </div>
                    <section className="deferred-packs" aria-labelledby="deferred-pack-title">
                        <h3 id="deferred-pack-title">Branded packs: use official sources</h3>
                        <p>We do not repackage community AWS, Google Cloud, Kubernetes, or Azure artwork where standalone redistribution rights are unclear.</p>
                        <ul>
                            {deferredCloudPacks.map((pack) => (
                                <li key={pack.name}>
                                    <a href={pack.officialUrl} target="_blank" rel="noopener noreferrer">{pack.name}</a>
                                    <span>{pack.reason}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                </Modal>
            )}
        </main>
    );
}

export default App;
