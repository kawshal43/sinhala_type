export interface SelectionEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function insertAtSelection(value: string, selectionStart: number, selectionEnd: number, insertion: string): SelectionEdit {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const caret = start + insertion.length;
  return { value: value.slice(0, start) + insertion + value.slice(end), selectionStart: caret, selectionEnd: caret };
}

export function deleteAtSelection(value: string, selectionStart: number, selectionEnd: number): SelectionEdit {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  if (start !== end) return insertAtSelection(value, start, end, "");
  if (start === 0) return { value, selectionStart: 0, selectionEnd: 0 };

  const previous = value.codePointAt(start - 1)!;
  const deleteFrom = previous >= 0xdc00 && previous <= 0xdfff && start >= 2 ? start - 2 : start - 1;
  return insertAtSelection(value, deleteFrom, start, "");
}

export function applySelectionEdit(textarea: HTMLTextAreaElement, edit: SelectionEdit): void {
  textarea.value = edit.value;
  textarea.focus();
  textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
