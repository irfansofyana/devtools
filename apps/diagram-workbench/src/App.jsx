import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CaptureUpdateAction,
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
import { createBoard, createCopyName, filterBoards, normalizeBoardName, sortBoardsByUpdatedAt } from './domain/boards.js';
import { componentPacks, deferredCloudPacks } from './domain/component-packs.js';
import { createDefaultLibraryMigration } from './domain/default-library.js';
import { layoutSelectedElements } from './domain/layout.js';
import { mergeImportedLibraryItems, stabilizeImportedLibraryItems } from './domain/library-import.js';
import { createQuickInsertSkeletons, quickInsertCatalog } from './domain/quick-insert.js';
import { templateToSkeletons } from './domain/template-elements.js';
import { getTemplate, templateCatalog } from './domain/templates.js';
import { createSerializedDeltaQueue, createWorkspaceOperationCoordinator, refreshCommittedLibraryView } from './domain/workspace-operations.js';
import {
    deleteBoard,
    getSetting,
    listBoards,
    loadScene,
    loadWorkspaceScenes,
    replaceWorkspace,
    saveBoard,
    setSetting,
    updateLibraryItems,
    updateSettingsAtomically,
} from './storage/workspace-db.js';
import { downloadBlob, safeFilename } from './utils/download.js';

const AUTOSAVE_DELAY = 700;
const EMPTY_FILES = {};
const MAX_MERMAID_CHARACTERS = 20_000;
const MAX_LIBRARY_FILE_BYTES = 50 * 1024 * 1024;
const rejectRemoteEmbeddable = () => false;
const renderLocalOnlyEmbeddable = () => null;

function isAllowedCommunityLibraryUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || !url.pathname.endsWith('.excalidrawlib')) return false;
        if (url.hostname === 'libraries.excalidraw.com') return url.pathname.startsWith('/libraries/');
        return url.hostname === 'raw.githubusercontent.com'
            && /^\/excalidraw\/excalidraw-libraries\/[^/]+\/libraries\//.test(url.pathname);
    } catch {
        return false;
    }
}

function materializeDefaultLibraryItem(definition) {
    return {
        id: definition.id,
        status: 'published',
        created: 1,
        elements: convertToExcalidrawElements(definition.skeletons, { regenerateIds: false }),
    };
}

function blankScene() {
    return {
        type: 'excalidraw',
        version: 2,
        source: window.location.origin,
        elements: [],
        appState: {
            theme: 'light',
            viewBackgroundColor: '#ffffff',
            gridSize: 20,
        },
        files: {},
    };
}

function withWhiteCanvas(scene) {
    return {
        ...scene,
        appState: {
            ...(scene?.appState ?? {}),
            theme: 'light',
            viewBackgroundColor: '#ffffff',
        },
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
    const [libraryImportError, setLibraryImportError] = useState('');
    const [librarySaveNotice, setLibrarySaveNotice] = useState('');
    const [panel, setPanel] = useState(null);
    const [boardQuery, setBoardQuery] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 920px)').matches);
    const [installedPacks, setInstalledPacks] = useState([]);
    const [packLoading, setPackLoading] = useState(null);
    const [mermaidText, setMermaidText] = useState('flowchart TD\n    Client --> API\n    API --> Cache\n    API --> Database');
    const [mermaidError, setMermaidError] = useState('');
    const [storagePersistent, setStoragePersistent] = useState(null);
    const [workspaceBusy, setWorkspaceBusy] = useState(false);
    const importInputRef = useRef(null);
    const libraryInputRef = useRef(null);
    const workspaceInputRef = useRef(null);
    const sidebarToggleRef = useRef(null);
    const sidebarRef = useRef(null);
    const pendingSidebarFocusRef = useRef(false);
    const latestSceneRef = useRef(null);
    const currentBoardRef = useRef(null);
    const saveTimerRef = useRef(null);
    const saveQueueRef = useRef(Promise.resolve());
    const libraryWriteQueueRef = useRef(null);
    const suppressLibraryChangeDepthRef = useRef(0);
    if (libraryWriteQueueRef.current === null) {
        libraryWriteQueueRef.current = createSerializedDeltaQueue({
            initialValue: [],
            persist: async (previousItems, nextItems) => {
                const { updates } = await updateLibraryItems(previousItems, nextItems);
                return updates['library-items'];
            },
        });
    }
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

    useEffect(() => {
        if (!editor || !initialData?.appState?.scrollToContent) return undefined;
        const frame = window.requestAnimationFrame(() => {
            const elements = editor.getSceneElements();
            if (!elements.length) return;
            editor.scrollToContent(elements, {
                fitToViewport: true,
                viewportZoomFactor: 0.82,
                maxZoom: 1,
                animate: false,
            });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [editor, editorKey, initialData]);

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
                await libraryWriteQueueRef.current.flush();
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
                let savedLibrary = [];
                const savedPacks = await getSetting('installed-packs', []);
                let defaultLibraryWarning = '';
                try {
                    const { current, updates } = await updateSettingsAtomically(
                        ['library-items', 'default-library-version'],
                        (settings) => {
                            const migration = createDefaultLibraryMigration(
                                settings['library-items'] ?? [],
                                settings['default-library-version'] ?? 0,
                                materializeDefaultLibraryItem,
                            );
                            return migration ? {
                                'library-items': migration.libraryItems,
                                'default-library-version': migration.version,
                            } : null;
                        },
                    );
                    savedLibrary = updates?.['library-items'] ?? current['library-items'] ?? [];
                } catch (error) {
                    console.error('Built-in component library could not be prepared', error);
                    defaultLibraryWarning = 'Workspace loaded; built-in components unavailable';
                    savedLibrary = await getSetting('library-items', []);
                }
                let board = availableBoards.find(({ id }) => id === preferredId) ?? availableBoards[0];

                if (!board) {
                    board = createBoard({ id: crypto.randomUUID(), name: 'Untitled diagram' });
                    const scene = blankScene();
                    await saveBoard(board, JSON.stringify(scene));
                    availableBoards = [board];
                }

                const scene = withWhiteCanvas((await loadScene(board.id)) ?? blankScene());
                scene.libraryItems = savedLibrary;
                libraryWriteQueueRef.current.setBaseline(savedLibrary);
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
                setSaveState(defaultLibraryWarning || 'Saved locally');
                if (navigator.storage?.persisted) setStoragePersistent(await navigator.storage.persisted());
            } catch (error) {
                console.error('Could not open local diagram workspace', error);
                if (!active) return;
                const fallbackBoard = createBoard({ id: crypto.randomUUID(), name: 'Unsaved diagram' });
                setBoards([fallbackBoard]);
                currentBoardRef.current = fallbackBoard;
                setCurrentBoard(fallbackBoard);
                setInitialData(blankScene());
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
        const canvasScene = withWhiteCanvas(scene);
        latestSceneRef.current = {
            elements: canvasScene.elements ?? [],
            appState: canvasScene.appState,
            files: canvasScene.files ?? {},
        };
        saveRevisionRef.current = 0;
        savedRevisionRef.current = 0;
        currentBoardRef.current = board;
        libraryWriteQueueRef.current.setBaseline(libraryItems);
        setCurrentBoard(board);
        setInitialData({ ...canvasScene, libraryItems });
        setEditor(null);
        setEditorKey((value) => value + 1);
        setPanel(null);
        setSaveState(status);
        if (window.matchMedia('(max-width: 920px)').matches) closeSidebar(true);
    }, [closeSidebar]);

    const loadAndActivateBoard = useCallback(async (board) => {
        const scene = (await loadScene(board.id)) ?? blankScene();
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
    }, [activateBoard]);

    const createAndActivateBoard = useCallback(async (name = 'Untitled diagram', scene = blankScene()) => {
        const canvasScene = withWhiteCanvas(scene);
        const board = createBoard({ id: crypto.randomUUID(), name });
        await saveBoard(board, JSON.stringify(canvasScene));
        let settingsAvailable = true;
        let libraryItems = [];
        try {
            await setSetting('current-board-id', board.id);
            libraryItems = await getSetting('library-items', []);
        } catch (error) {
            settingsAvailable = false;
            console.error('Diagram workspace settings unavailable', error);
        }
        setBoardQuery('');
        setBoards((items) => sortBoardsByUpdatedAt([...items, board]));
        activateBoard(board, canvasScene, libraryItems, settingsAvailable ? 'Saved locally' : 'Board saved; current-board preference unavailable');
        return board;
    }, [activateBoard]);

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

    const createNewBoard = useCallback(async (name = 'Untitled diagram', scene = blankScene()) => {
        if (operationCoordinatorRef.current.isActive()) return null;
        try {
            const result = await runWorkspaceOperation('create-board', () => createAndActivateBoard(name, scene));
            return result.accepted ? result.value : null;
        } catch (error) {
            console.error('Local diagram creation failed', error);
            setSaveState('Could not create a local board — export a workspace backup');
            return null;
        }
    }, [createAndActivateBoard, runWorkspaceOperation]);

    const duplicateCurrentBoard = useCallback(async () => {
        if (!currentBoard || !latestSceneRef.current || operationCoordinatorRef.current.isActive()) return null;
        const copyName = createCopyName(currentBoard.name, boards.map(({ name }) => name));
        try {
            const result = await runWorkspaceOperation('duplicate-board', async () => {
                const scene = structuredClone(latestSceneRef.current);
                scene.appState = { ...scene.appState, scrollToContent: true };
                return createAndActivateBoard(copyName, scene);
            });
            return result.accepted ? result.value : null;
        } catch (error) {
            console.error('Local diagram duplication failed', error);
            setSaveState('Could not duplicate this board — export a workspace backup');
            return null;
        }
    }, [boards, createAndActivateBoard, currentBoard, runWorkspaceOperation]);

    const insertQuickBlock = useCallback((blockId) => {
        if (!editor || operationCoordinatorRef.current.isActive()) return;
        try {
            const appState = editor.getAppState();
            const zoom = Number(appState.zoom?.value ?? appState.zoom ?? 1) || 1;
            const center = {
                x: -(Number(appState.scrollX) || 0) + (Number(appState.width) || window.innerWidth) / (2 * zoom),
                y: -(Number(appState.scrollY) || 0) + (Number(appState.height) || window.innerHeight) / (2 * zoom),
            };
            const skeletons = createQuickInsertSkeletons(blockId, center, crypto.randomUUID());
            const inserted = convertToExcalidrawElements(skeletons, { regenerateIds: false });
            const selectedElementIds = Object.fromEntries(inserted.map(({ id }) => [id, true]));
            editor.updateScene({
                elements: [...editor.getSceneElements(), ...inserted],
                appState: { selectedElementIds },
                captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
            editor.scrollToContent(inserted);
            setPanel(null);
            setSaveState(`${quickInsertCatalog.find(({ id }) => id === blockId)?.label ?? 'Block'} added`);
        } catch (error) {
            console.error('Quick block insertion failed', error);
            setSaveState('Could not add that canvas block');
        }
    }, [editor]);

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
            const scene = blankScene();
            scene.elements = elements;
            scene.appState.scrollToContent = true;
            await createNewBoard(template.name, scene);
        } catch (error) {
            console.error('Template creation failed', error);
            setSaveState('Template failed to load');
        }
    }, [createNewBoard]);

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
            const scene = blankScene();
            scene.elements = elements;
            scene.files = result.files ?? {};
            scene.appState.scrollToContent = true;
            await createNewBoard('Mermaid diagram', scene);
        } catch (error) {
            console.error('Mermaid conversion failed', error);
            setMermaidError(error?.message || 'Could not parse this Mermaid diagram.');
        }
    }, [createNewBoard, mermaidText]);

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
                const { updates } = await updateSettingsAtomically(
                    ['library-items', 'installed-packs'],
                    (settings) => ({
                        'library-items': mergeLibraryItems(settings['library-items'] ?? [], items),
                        'installed-packs': [...new Set([...(settings['installed-packs'] ?? []), pack.id])],
                    }),
                );
                const mergedItems = updates['library-items'];
                const next = updates['installed-packs'];
                try {
                    await refreshCommittedLibraryView({
                        queue: libraryWriteQueueRef.current,
                        committedItems: mergedItems,
                        suppressionRef: suppressLibraryChangeDepthRef,
                        refresh: () => editor.updateLibrary({ libraryItems: mergedItems, merge: false, openLibraryMenu: true, defaultStatus: 'published' }),
                    });
                } catch (error) {
                    const persistedError = new Error('Pack stored locally, but the library view could not refresh. Reload to display it.', { cause: error });
                    persistedError.libraryPersisted = true;
                    throw persistedError;
                }
                setInstalledPacks(next);
                setPanel(null);
                setSaveState(`${pack.name} installed locally`);
            });
            if (!result.accepted) throw new Error('Another workspace operation started first.');
        } catch (error) {
            console.error('Component pack installation failed', error);
            setSaveState(error.libraryPersisted ? error.message : `${pack.name} could not be installed`);
        } finally {
            setPackLoading(null);
        }
    }, [editor, packLoading, runWorkspaceOperation]);

    const persistLibrary = useCallback(async (libraryItems) => {
        if (suppressLibraryChangeDepthRef.current > 0) return;
        const previousLibraryItems = libraryWriteQueueRef.current.getBaseline();
        const importedPersonalLibrary = libraryItems.length > previousLibraryItems.length;
        try {
            await libraryWriteQueueRef.current.enqueue(libraryItems);
            setLibraryImportError('');
            if (importedPersonalLibrary) setLibrarySaveNotice('Personal library saved locally');
        } catch (error) {
            console.error('Library persistence failed', error);
            setSaveState('Component library save failed');
            setLibrarySaveNotice('');
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
                    defaultLibraryVersion: await getSetting('default-library-version', 0),
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
                const defaultMigration = createDefaultLibraryMigration(
                    backup.libraryItems,
                    backup.defaultLibraryVersion ?? 0,
                    materializeDefaultLibraryItem,
                );
                const restoredLibrary = defaultMigration?.libraryItems ?? backup.libraryItems;
                const restoredDefaultVersion = defaultMigration?.version ?? backup.defaultLibraryVersion ?? 0;
                await replaceWorkspace({
                    ...backup,
                    libraryItems: restoredLibrary,
                    installedPacks: restoredPacks,
                    defaultLibraryVersion: restoredDefaultVersion,
                });
                const firstBoard = backup.boards[0];
                const scene = backup.scenes[firstBoard.id];
                setBoards(sortBoardsByUpdatedAt(backup.boards));
                setInstalledPacks(restoredPacks);
                activateBoard(firstBoard, scene, restoredLibrary, 'Workspace restored locally');
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

    const installLibraryFile = useCallback(async (file) => {
        if (!editor) throw new Error('The diagram editor is not ready.');
        if (operationCoordinatorRef.current.isActive()) throw new Error('Another workspace operation is active. Try the library import again.');
        if (file.size > MAX_LIBRARY_FILE_BYTES) throw new Error('Library import rejected: file exceeds 50 MiB');
        const preparationToken = operationCoordinatorRef.current.currentToken();
        const loadedItems = await loadLibraryFromBlob(file, 'published');
        if (!loadedItems.length) throw new Error('No library items found');
        const items = await stabilizeImportedLibraryItems(file, loadedItems);
        if (operationCoordinatorRef.current.isActive()
            || operationCoordinatorRef.current.currentToken() !== preparationToken) {
            throw new Error('The workspace changed during library loading. Try the import again.');
        }
        let addedCount = 0;
        const result = await runWorkspaceOperation('import-component-library', async () => {
            const { updates } = await updateSettingsAtomically(['library-items'], (settings) => {
                const currentItems = settings['library-items'] ?? [];
                const mergedItems = mergeImportedLibraryItems(currentItems, items);
                addedCount = mergedItems.length - currentItems.length;
                return { 'library-items': mergedItems };
            });
            const mergedItems = updates['library-items'];
            try {
                await refreshCommittedLibraryView({
                    queue: libraryWriteQueueRef.current,
                    committedItems: mergedItems,
                    suppressionRef: suppressLibraryChangeDepthRef,
                    refresh: () => editor.updateLibrary({
                        libraryItems: mergedItems,
                        merge: false,
                        openLibraryMenu: true,
                        defaultStatus: 'published',
                    }),
                });
            } catch (error) {
                const persistedError = new Error('Library stored locally, but the library view could not refresh. Reload to display it.', { cause: error });
                persistedError.libraryPersisted = true;
                throw persistedError;
            }
            setSaveState(addedCount
                ? `Imported ${addedCount} community library item${addedCount === 1 ? '' : 's'}`
                : 'Community library already installed');
            setLibraryImportError('');
            setLibrarySaveNotice(addedCount
                ? `${addedCount} community library item${addedCount === 1 ? '' : 's'} saved locally`
                : 'Community library already saved locally');
        });
        if (!result.accepted) throw new Error('Another workspace operation started first. Try the import again.');
        return addedCount;
    }, [editor, runWorkspaceOperation]);

    const importLibrary = useCallback(async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            await installLibraryFile(file);
        } catch (error) {
            console.error('Community library import failed', error);
            const message = error.libraryPersisted
                ? error.message
                : error.message?.includes('50 MiB') || error.message?.includes('workspace operation')
                    ? error.message
                    : 'Library import failed: choose a valid .excalidrawlib file';
            setSaveState(message);
            setLibraryImportError(message);
            setLibrarySaveNotice('');
        }
    }, [installLibraryFile]);

    useEffect(() => {
        if (!editor) return undefined;
        const handleCommunityLibraryReturn = async () => {
            const parameters = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const libraryUrl = parameters.get('addLibrary');
            if (!libraryUrl) return;
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
            try {
                if (parameters.get('token') !== editor.id) throw new Error('Community library link token is invalid or expired.');
                if (!isAllowedCommunityLibraryUrl(libraryUrl)) throw new Error('Community library URL is not allowed.');
                if (operationCoordinatorRef.current.isActive()) throw new Error('Another workspace operation is active. Open the community library link again.');
                const response = await fetch(libraryUrl, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
                if (!response.ok) throw new Error(`Community library request failed (${response.status}).`);
                const declaredSize = Number(response.headers.get('content-length'));
                if (Number.isFinite(declaredSize) && declaredSize > MAX_LIBRARY_FILE_BYTES) throw new Error('Library import rejected: file exceeds 50 MiB');
                const blob = await response.blob();
                if (blob.size > MAX_LIBRARY_FILE_BYTES) throw new Error('Library import rejected: file exceeds 50 MiB');
                const filename = new URL(libraryUrl).pathname.split('/').at(-1) || 'community-library.excalidrawlib';
                await installLibraryFile(new File([blob], filename, { type: blob.type || 'application/json' }));
            } catch (error) {
                console.error('Community library link import failed', error);
                const message = error.libraryPersisted ? error.message : error.message || 'Community library link import failed';
                setSaveState(message);
                setLibraryImportError(message);
            }
        };
        window.addEventListener('hashchange', handleCommunityLibraryReturn);
        void handleCommunityLibraryReturn();
        return () => window.removeEventListener('hashchange', handleCommunityLibraryReturn);
    }, [editor, installLibraryFile]);

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

    const filteredBoards = useMemo(() => filterBoards(boards, boardQuery), [boardQuery, boards]);
    const planningTemplates = useMemo(() => templateCatalog.filter(({ category }) => category === 'Planning'), []);
    const technicalTemplates = useMemo(() => templateCatalog.filter(({ category }) => category !== 'Planning'), []);
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
                    <button className="primary-action" type="button" onClick={() => setPanel('add')} aria-label="Add to canvas">＋ Add</button>
                    <button type="button" onClick={() => setPanel('templates')}>Templates</button>
                    <button type="button" onClick={() => setPanel('mermaid')}>Mermaid</button>
                    <button type="button" onClick={() => setPanel('packs')}>Components</button>
                    <button type="button" onClick={arrangeSelection}>Arrange</button>
                    <div className="menu-wrap">
                        <details>
                            <summary>Import</summary>
                            <div className="menu-popover">
                                <button type="button" onClick={() => importInputRef.current?.click()}>Excalidraw file</button>
                                <button type="button" onClick={() => libraryInputRef.current?.click()}>Community library</button>
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
                                <button type="button" onClick={() => setPanel('add')}>Add to canvas</button>
                                <button type="button" onClick={() => setPanel('templates')}>Templates</button>
                                <button type="button" onClick={() => setPanel('mermaid')}>Mermaid to canvas</button>
                                <button type="button" onClick={() => setPanel('packs')}>Component packs</button>
                                <button type="button" onClick={arrangeSelection}>Arrange selection</button>
                                <button type="button" onClick={() => importInputRef.current?.click()}>Import diagram</button>
                                <button type="button" onClick={() => libraryInputRef.current?.click()}>Import community library</button>
                                <button type="button" onClick={() => workspaceInputRef.current?.click()}>Restore workspace backup</button>
                                <button type="button" onClick={exportScene}>Export Excalidraw file</button>
                                <button type="button" onClick={() => exportImage('png')}>Export PNG image</button>
                                <button type="button" onClick={() => exportImage('svg')}>Export SVG image</button>
                                <button type="button" onClick={exportArtifactPack}>Export documentation pack</button>
                                <button type="button" onClick={exportWorkspace}>Export workspace backup</button>
                            </div>
                        </details>
                    </div>
                    <button className="icon-button" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? '☀' : '◐'}</button>
                    <input ref={importInputRef} className="visually-hidden" type="file" accept=".excalidraw,application/json,application/vnd.excalidraw+json" onChange={importScene} />
                    <input ref={libraryInputRef} className="visually-hidden" type="file" onChange={importLibrary} />
                    <input ref={workspaceInputRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={importWorkspace} />
                </div>
            </header>

            {libraryImportError && (
                <div className="library-import-alert" role="alert">
                    <span>{libraryImportError}</span>
                    <button type="button" onClick={() => setLibraryImportError('')} aria-label="Dismiss library import error">×</button>
                </div>
            )}

            {librarySaveNotice && !libraryImportError && (
                <div className="library-save-notice" role="status">
                    <span>{librarySaveNotice}</span>
                    <button type="button" onClick={() => setLibrarySaveNotice('')} aria-label="Dismiss library save notice">×</button>
                </div>
            )}

            <div className="workbench-main">
                <button className={`sidebar-scrim ${sidebarOpen ? 'is-visible' : ''}`} type="button" disabled={!sidebarOpen || workspaceBusy} onClick={() => closeSidebar(true)} aria-label="Close local boards" aria-hidden={!sidebarOpen} tabIndex={sidebarOpen && !workspaceBusy ? 0 : -1} />
                <aside ref={sidebarRef} id="local-board-sidebar" className={`board-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Local diagram boards" aria-hidden={!sidebarOpen} inert={workspaceBusy || !sidebarOpen ? '' : undefined}>
                    <div className="sidebar-heading">
                        <div><strong>Local boards</strong><span>{boardCountLabel}</span></div>
                        <button className="icon-button" type="button" onClick={() => createNewBoard()} aria-label="Create new diagram">+</button>
                    </div>
                    <label className="board-search">
                        <span aria-hidden="true">⌕</span>
                        <input type="search" value={boardQuery} onChange={(event) => setBoardQuery(event.target.value)} placeholder="Find a board" aria-label="Search local boards" />
                    </label>
                    <div className="board-list">
                        {filteredBoards.map((board) => (
                            <button key={board.id} type="button" className={`board-row ${board.id === currentBoard.id ? 'is-active' : ''}`} onClick={() => openBoard(board)} aria-current={board.id === currentBoard.id ? 'page' : undefined}>
                                <span>{board.name}</span>
                                <small>{new Date(board.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
                            </button>
                        ))}
                        {!filteredBoards.length && <p className="board-empty">No boards match “{boardQuery.trim()}”.</p>}
                    </div>
                    <div className="storage-note">
                        <strong>Stored in this browser</strong>
                        <p>Export an Excalidraw file for a portable backup.</p>
                        {storagePersistent === false && <button type="button" className="text-button" onClick={requestPersistentStorage}>Protect local storage</button>}
                        {storagePersistent === true && <span>Persistent storage granted</span>}
                    </div>
                    <div className="board-sidebar-actions">
                        <button type="button" onClick={duplicateCurrentBoard} aria-label="Duplicate current board">Duplicate</button>
                        <button className="delete-board-button" type="button" onClick={removeCurrentBoard}>Delete</button>
                    </div>
                </aside>

                <section className={`canvas-region ${workspaceBusy ? 'is-busy' : ''}`} id="diagram-canvas" aria-label="Diagram canvas" inert={workspaceBusy ? '' : undefined}>
                    <Excalidraw
                        key={editorKey}
                        excalidrawAPI={setEditor}
                        initialData={initialData}
                        onChange={handleChange}
                        onLibraryChange={persistLibrary}
                        libraryReturnUrl={`${window.location.origin}${import.meta.env.BASE_URL}`}
                        validateEmbeddable={rejectRemoteEmbeddable}
                        renderEmbeddable={renderLocalOnlyEmbeddable}
                        theme="light"
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

            {panel === 'add' && (
                <Modal title="Add to canvas" description="Drop a ready-to-edit block in the center of your current view." onClose={closePanel} busy={workspaceBusy}>
                    <div className="quick-insert-grid">
                        {quickInsertCatalog.map((item) => (
                            <button className="quick-insert-card" type="button" key={item.id} onClick={() => insertQuickBlock(item.id)}>
                                <span className="quick-insert-preview" data-block={item.id} aria-hidden="true"><i /></span>
                                <span className="quick-insert-copy">
                                    <span className="card-meta">{item.category}</span>
                                    <strong>{item.label}</strong>
                                    <small>{item.description}</small>
                                </span>
                            </button>
                        ))}
                    </div>
                    <p className="modal-footnote">Need raw shapes, arrows, drawing, or images? The canvas toolbar remains available underneath.</p>
                </Modal>
            )}

            {panel === 'templates' && (
                <Modal title="Start from a template" description="Each template opens as a new local board, so your current canvas stays untouched." onClose={closePanel} busy={workspaceBusy}>
                    <section className="template-section" aria-labelledby="planning-template-title">
                        <div className="template-section-heading"><div><span className="card-meta">Whiteboard</span><h3 id="planning-template-title">Plan and think</h3></div><small>Brainstorms, journeys, boards, and retrospectives</small></div>
                        <div className="template-grid">
                            {planningTemplates.map((template) => (
                                <button className="template-card is-planning" type="button" key={template.id} onClick={() => applyTemplate(template.id)}>
                                    <span className="card-meta">{template.category}</span>
                                    <strong>{template.name}</strong>
                                    <p>{template.description}</p>
                                    <small>{template.nodes.length} editable blocks</small>
                                </button>
                            ))}
                        </div>
                    </section>
                    <section className="template-section" aria-labelledby="technical-template-title">
                        <div className="template-section-heading"><div><span className="card-meta">Technical</span><h3 id="technical-template-title">Design systems</h3></div><small>Architecture and engineering starters</small></div>
                        <div className="template-grid">
                            {technicalTemplates.map((template) => (
                                <button className="template-card" type="button" key={template.id} onClick={() => applyTemplate(template.id)}>
                                    <span className="card-meta">{template.category}</span>
                                    <strong>{template.name}</strong>
                                    <p>{template.description}</p>
                                    <small>{template.nodes.length} components</small>
                                </button>
                            ))}
                        </div>
                    </section>
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
                <Modal title="Components" description="Irfan Core is ready in Excalidraw’s Library. Optional community packs can be added below and remain local to this browser." onClose={closePanel} busy={workspaceBusy}>
                    <div className="pack-list">
                        <article className="pack-row">
                            <div>
                                <span className="card-meta">Built in · first-party</span>
                                <h3>Irfan Core</h3>
                                <p>36 editable AWS, Kubernetes, AI / LLM, and reusable architecture-pattern components.</p>
                                <small>Original artwork · available offline · no install required</small>
                            </div>
                            <span className="pack-state">Ready</span>
                        </article>
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
