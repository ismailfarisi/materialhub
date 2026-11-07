import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichEditor } from "./rich-editor";

describe("RichEditor", () => {
  it("shows content that arrives after mount (edit pages load the stored body late)", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<RichEditor content="" onChange={onChange} />);
    rerender(<RichEditor content="<p>Stored shipping policy</p>" onChange={onChange} />);
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror")?.textContent).toContain(
        "Stored shipping policy",
      ),
    );
    // Loading the stored body is not an edit.
    expect(onChange).not.toHaveBeenCalled();
  });
});
