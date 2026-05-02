import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the actual parsing logic from upload-routes.ts by copying it here
function readBoundary(contentType) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] ?? match?.[2]?.trim() ?? null;
}

function parseMultipart(body, boundary) {
  const boundaryText = `--${boundary}`;
  const raw = body.toString("latin1");
  return raw
    .split(boundaryText)
    .slice(1, -1)
    .map((section) => section.replace(/^\r\n/, "").replace(/\r\n$/, ""))
    .map(parsePart)
    .filter((part) => part !== null);
}

function parsePart(section) {
  const headerEnd = section.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;

  const headers = {};
  section
    .slice(0, headerEnd)
    .split("\r\n")
    .forEach((line) => {
      const separator = line.indexOf(":");
      if (separator > -1) {
        headers[line.slice(0, separator).toLowerCase()] = line
          .slice(separator + 1)
          .trim();
      }
    });

  const disposition = headers["content-disposition"] ?? "";
  const name = readDispositionValue(disposition, "name");
  if (!name) return null;

  const filename = readDispositionValue(disposition, "filename");
  const data = Buffer.from(section.slice(headerEnd + 4), "latin1");
  return { data, filename, headers, name };
}

function readDispositionValue(disposition, key) {
  const match = disposition.match(new RegExp(`${key}="([^"]*)"`, "i"));
  return match?.[1] ?? null;
}

function fieldsFromParts(parts) {
  const fields = {};
  parts.forEach((part) => {
    if (!part.filename) {
      fields[part.name] = part.data.toString("utf8").trim();
    }
  });
  return fields;
}

async function run() {
  const fileData = Buffer.from("Hello World!", "utf8");
  const contentHash = createHash("sha256").update(fileData).digest("hex");

  const formData = new FormData();
  formData.set("chatId", "chat123");
  formData.set("senderPubkeyHash", "0000000000000000000000000000000000000000000000000000000000000000");
  formData.set("recipientPubkeyHash", "0000000000000000000000000000000000000000000000000000000000000000");
  formData.set("contentHash", contentHash);
  formData.set("size", "12");
  formData.set("file", new Blob([fileData], { type: "application/octet-stream" }), `${contentHash}.bin`);

  const request = new Request("http://localhost/", {
    method: "POST",
    body: formData
  });

  const contentType = request.headers.get("content-type");
  const boundary = readBoundary(contentType);
  console.log("Boundary:", boundary);

  const arrayBuffer = await request.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const parts = parseMultipart(buffer, boundary);
  const fields = fieldsFromParts(parts);
  const filePart = parts.find((p) => p.name === "file" && p.filename);

  console.log("Fields:", fields);
  console.log("File part exists?", !!filePart);
  if (filePart) {
    console.log("File original length:", fileData.length);
    console.log("File parsed length:", filePart.data.length);
    console.log("Match?", Buffer.compare(fileData, filePart.data) === 0);
  }
}

run().catch(console.error);
