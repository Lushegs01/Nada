import { createHash } from "node:crypto";

// Minimal test to dump the raw FormData string to see exact CRLF placement
async function run() {
  const fileData = Buffer.from("Hello World!", "utf8");
  const contentHash = createHash("sha256").update(fileData).digest("hex");

  const formData = new FormData();
  formData.set("chatId", "chat123");
  formData.set("file", new Blob([fileData], { type: "application/octet-stream" }), `${contentHash}.bin`);

  const request = new Request("http://localhost/", {
    method: "POST",
    body: formData
  });

  const arrayBuffer = await request.arrayBuffer();
  const raw = Buffer.from(arrayBuffer).toString("latin1");
  console.log(raw.replace(/\r/g, "\\r").replace(/\n/g, "\\n\n"));
}
run().catch(console.error);
