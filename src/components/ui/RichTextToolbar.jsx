import React from 'react';
import { Bold, Italic, Underline, Strikethrough, Superscript, Subscript } from 'lucide-react';
import { applyFormat } from '../../utils/helpers';

const RichTextToolbar = ({ inputRef, value, onChange }) => {
  const handleFormat = (format) => {
    const el = inputRef?.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const result = applyFormat(value, s, e, format);
    onChange(result.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.cursor - (result.cursor - e), result.cursor);
    });
  };

  const tools = [
    { icon: <Bold size={13}/>, fmt: 'bold', title: 'Bold' },
    { icon: <Italic size={13}/>, fmt: 'italic', title: 'Italic' },
    { icon: <Underline size={13}/>, fmt: 'underline', title: 'Underline' },
    { icon: <Strikethrough size={13}/>, fmt: 'strike', title: 'Strikethrough' },
    { icon: <Superscript size={13}/>, fmt: 'superscript', title: 'Superscript' },
    { icon: <Subscript size={13}/>, fmt: 'subscript', title: 'Subscript' },
  ];

  return (
    <div className="flex items-center gap-1 bg-gray-100 border border-b-0 border-gray-300 rounded-t-lg px-2 py-1 flex-wrap">
      {tools.map(({ icon, fmt, title }) => (
        <button
          key={fmt}
          type="button"
          title={title}
          onMouseDown={(e) => { e.preventDefault(); handleFormat(fmt); }}
          className="p-1.5 rounded hover:bg-white hover:shadow-sm text-gray-500 hover:text-indigo-700 transition text-xs"
        >
          {icon}
        </button>
      ))}
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <span className="text-[10px] text-gray-400 italic">Pilih teks → format</span>
    </div>
  );
};

export default RichTextToolbar;
