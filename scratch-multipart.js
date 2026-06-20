import { createHash } from "node:crypto";

const boundaryText = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
const boundary = "--" + boundaryText;

// Create pseudo-random binary data mimicking AES-GCM output
// Let's deliberately add \r\n to the binary data to see what happens
const fileData = Buffer.concat([
    Buffer.from("RandomDataHere123\r\n"),
    Buffer.from([0x0d, 0x0a]),
    Buffer.from("MoreData")
]);

const contentHash = createHash("sha256").update(fileData).digest("hex");

let body = `${boundary}\r\nContent-Disposition: form-data; name="chatId"\r\n\r\nchat123\r\n`;
body += `${boundary}\r\nContent-Disposition: form-data; name="contentHash"\r\n\r\n${contentHash}\r\n`;
body += `${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${contentHash}.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`;

// Append raw file data and trailing multipart boundary
const bodyBuffer = Buffer.concat([
    Buffer.from(body, "latin1"),
    fileData,
    Buffer.from(`\r\n${boundary}--\r\n`, "latin1")
]);

function parseMultipart(body, boundaryText) {
  const boundary = `--${boundaryText}`;
  const raw = body.toString("latin1");
  return raw
    .split(boundary)
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

const parts = parseMultipart(bodyBuffer, boundaryText);
const filePart = parts.find(p => p.name === "file");

console.log("Original file length:", fileData.length);
console.log("Parsed file length:", filePart.data.length);
console.log("Original hash:", contentHash);
console.log("Parsed hash:", createHash("sha256").update(filePart.data).digest("hex"));

if (Buffer.compare(fileData, filePart.data) !== 0) {
    console.error("Mismatch!");
} else {
    console.log("Match!");
}
