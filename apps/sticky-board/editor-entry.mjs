import { Editor, generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';

const FONT_SIZES = new Set(['0.8rem', '0.95rem', '1.1rem', '1.35rem']);
const TEXT_COLORS = new Set(['#2f2a24', '#a33845', '#1d5fab', '#157047', '#7044a8', '#ad541f']);

const extensions = [
    StarterKit.configure({ link: false }),
    TextStyle,
    FontSize,
    Color,
    Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: 'Start writing…' }),
];

export function renderNoteDocument(document) {
    return generateHTML(document, extensions);
}

export function createNoteEditor({ element, content, onUpdate, onFocus, onBlur, onStateChange }) {
    const editor = new Editor({
        element,
        extensions,
        content,
        autofocus: false,
        editorProps: {
            attributes: {
                class: 'note-editor__content',
                spellcheck: 'true',
                'aria-label': 'Note content',
            },
        },
        onUpdate: ({ editor: instance }) => onUpdate?.(instance.getJSON(), instance.getText()),
        onFocus: () => onFocus?.(),
        onBlur: () => onBlur?.(),
        onSelectionUpdate: () => onStateChange?.(),
        onTransaction: () => onStateChange?.(),
    });

    const run = (action, value) => {
        const chain = editor.chain().focus();
        const commands = {
            bold: () => chain.toggleBold().run(),
            italic: () => chain.toggleItalic().run(),
            strike: () => chain.toggleStrike().run(),
            code: () => chain.toggleCode().run(),
            paragraph: () => chain.setParagraph().run(),
            heading: () => chain.toggleHeading({ level: 2 }).run(),
            'bullet-list': () => chain.toggleBulletList().run(),
            'ordered-list': () => chain.toggleOrderedList().run(),
            'task-list': () => chain.toggleTaskList().run(),
            undo: () => chain.undo().run(),
            redo: () => chain.redo().run(),
        };
        if (commands[action]) return commands[action]();
        if (action === 'font-size') {
            return value && FONT_SIZES.has(value)
                ? chain.setFontSize(value).run()
                : chain.unsetFontSize().run();
        }
        if (action === 'text-color') {
            return value && TEXT_COLORS.has(value)
                ? chain.setColor(value).run()
                : chain.unsetColor().run();
        }
        return false;
    };

    return {
        run,
        isActive: (name, attributes) => editor.isActive(name, attributes),
        getJSON: () => editor.getJSON(),
        getText: () => editor.getText(),
        getHTML: () => editor.getHTML(),
        focus: () => editor.commands.focus(),
        destroy: () => editor.destroy(),
    };
}
