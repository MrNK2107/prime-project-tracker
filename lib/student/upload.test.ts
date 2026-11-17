import { describe, it, expect, vi } from "vitest";
import { uploadProof, validateProofFile } from "@/lib/student/upload";

const UID = "11111111-0000-0000-0000-000000000001";

function client(uploadResult: { error: { message: string } | null } = { error: null }) {
  const upload = vi.fn(async () => uploadResult);
  const from = vi.fn(() => ({ upload }));
  return { upload, from, c: { auth: { getUser: async () => ({ data: { user: { id: UID } } }) }, storage: { from } } };
}

const file = (name: string, type: string, size: number) => ({ name, type, size }) as unknown as File;

describe("validateProofFile", () => {
  it.each([
    ["a.pdf", "application/pdf", "pdf"],
    ["a.jpg", "image/jpeg", "jpg"],
    ["a.png", "image/png", "png"],
  ])("accepts %s", (name, type, ext) => expect(validateProofFile({ name, type, size: 1000 })).toBe(ext));
  it("accepts exactly 5 MB", () => expect(validateProofFile({ name: "a.pdf", type: "application/pdf", size: 5242880 })).toBe("pdf"));
  it("rejects one byte over 5 MB", () => expect(() => validateProofFile({ name: "a.pdf", type: "application/pdf", size: 5242881 })).toThrow(/5 MB/));
  it("rejects a Word document", () =>
    expect(() => validateProofFile({ name: "a.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 10 })).toThrow(/PDF, JPG or PNG/));
  it("rejects an empty file and an unknown type", () => {
    expect(() => validateProofFile({ name: "a.pdf", type: "application/pdf", size: 0 })).toThrow(/empty/);
    expect(() => validateProofFile({ name: "a", type: "", size: 10 })).toThrow(/PDF, JPG or PNG/);
  });
});

describe("uploadProof", () => {
  it("rejects a 6 MB file without calling storage", async () => {
    const { c, from } = client();
    await expect(uploadProof(file("big.pdf", "application/pdf", 6 * 1024 * 1024), c)).rejects.toThrow(/5 MB/);
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects a .docx without calling storage", async () => {
    const { c, from } = client();
    await expect(uploadProof(file("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 100), c)).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it("uploads into the student's own folder without upsert and returns the path", async () => {
    const { c, from, upload } = client();
    const path = await uploadProof(file("cert.png", "image/png", 2048), c);
    expect(path).toMatch(new RegExp(`^${UID}/[0-9a-f-]{36}\\.png$`));
    expect(from).toHaveBeenCalledWith("proofs");
    expect(upload).toHaveBeenCalledWith(path, expect.anything(), { upsert: false, contentType: "image/png" });
  });
  it("gives a friendly message when the upload fails", async () => {
    const { c } = client({ error: { message: "boom" } });
    await expect(uploadProof(file("a.pdf", "application/pdf", 10), c)).rejects.toThrow(/could not be uploaded/);
  });
});
