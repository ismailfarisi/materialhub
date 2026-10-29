"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import TiptapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  TextB,
  TextItalic,
  TextHTwo,
  TextHThree,
  List,
  ListNumbers,
  Quotes,
  Link as LinkIcon,
  Image as ImageIcon,
} from "@phosphor-icons/react";
import { cn } from "../../lib/utils";

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

interface ToolbarButtonProps {
  isActive: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ isActive, onClick, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "p-1.5 rounded transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
      )}
    >
      {children}
    </button>
  );
}

export function RichEditor({ content, onChange, placeholder }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline" },
      }),
      TiptapImage.configure({
        HTMLAttributes: { class: "max-w-full rounded-lg" },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Start writing...",
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "min-h-[200px] px-4 py-3 text-sm text-stone-800 focus:outline-none prose prose-sm max-w-none",
      },
    },
    onUpdate({ editor: ed }) {
      onChange(ed.getHTML());
    },
  });

  if (!editor) return null;

  const handleLinkInsert = () => {
    const url = window.prompt("Enter URL");
    if (!url) return;
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const handleImageInsert = () => {
    const url = window.prompt("Enter image URL");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div className="rounded-lg border border-stone-200 overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-primary">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-stone-200 bg-stone-50">
        <ToolbarButton
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="TextB"
        >
          <TextB className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="TextItalic"
        >
          <TextItalic className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-stone-200 mx-1" />

        <ToolbarButton
          isActive={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <TextHTwo className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          isActive={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          <TextHThree className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-stone-200 mx-1" />

        <ToolbarButton
          isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          isActive={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered list"
        >
          <ListNumbers className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          isActive={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
        >
          <Quotes className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-stone-200 mx-1" />

        <ToolbarButton
          isActive={editor.isActive("link")}
          onClick={handleLinkInsert}
          title="Insert link"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          isActive={false}
          onClick={handleImageInsert}
          title="Insert image"
        >
          <ImageIcon className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  );
}
