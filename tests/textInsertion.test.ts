import { describe, expect, it } from "vitest";
import { deleteAtSelection, insertAtSelection } from "../src/ui/textInsertion";

describe("keyboard caret edits", () => {
  it("inserts at the caret and replaces a selection", () => {
    expect(insertAtSelection("k aa", 1, 1, "r")).toEqual({ value: "kr aa", selectionStart: 2, selectionEnd: 2 });
    expect(insertAtSelection("mama", 1, 3, "e")).toEqual({ value: "mea", selectionStart: 2, selectionEnd: 2 });
  });

  it("deletes a selection or the previous character", () => {
    expect(deleteAtSelection("mama", 1, 3)).toEqual({ value: "ma", selectionStart: 1, selectionEnd: 1 });
    expect(deleteAtSelection("ka", 2, 2)).toEqual({ value: "k", selectionStart: 1, selectionEnd: 1 });
  });
});
