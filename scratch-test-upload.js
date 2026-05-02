import { createHash } from "node:crypto";

const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
const fileData = Buffer.from("Hello World!", "utf8");
const hash = createHash("sha256").update(fileData).digest("hex");

let body = `--${boundary}\r\nContent-Disposition: form-data; name="chatId"\r\n\r\nchat123\r\n`;
body += `--${boundary}\r\nContent-Disposition: form-data; name="senderPubkeyHash"\r\n\r\n0000000000000000000000000000000000000000000000000000000000000000\r\n`;
body += `--${boundary}\r\nContent-Disposition: form-data; name="recipientPubkeyHash"\r\n\r\n0000000000000000000000000000000000000000000000000000000000000000\r\n`;
body += `--${boundary}\r\nContent-Disposition: form-data; name="contentHash"\r\n\r\n${hash}\r\n`;
body += `--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n12\r\n`;
body += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${hash}.bin"\r\nContent-Type: application/octet-stream\r\n\r\n${fileData.toString("latin1")}\r\n`;
body += `--${boundary}--\r\n`;

fetch("http://localhost:8080/api/media/upload", {
  method: "POST",
  headers: {
    "Content-Type": `multipart/form-data; boundary=${boundary}`
  },
  body: Buffer.from(body, "latin1")
}).then(async r => {
  console.log(r.status, await r.text());
}).catch(console.error);
