import http from "http";
import fs from "fs";
import path from "path";

export class FileServer {
  constructor() {
    this.mimeTypes = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".mp3": "audio/mpeg",
      ".png": "image/png",
      ".webmanifest": "application/manifest+json",
    };
  }

  create() {
    return http.createServer((req, res) => {
      let filePath = "." + req.url;
      if (filePath === "./") {
        filePath = "./index.html";
      }

      const extname = String(path.extname(filePath)).toLowerCase();
      const contentType = this.mimeTypes[extname] || "application/octet-stream";

      fs.readFile(filePath, (error, content) => {
        if (error) {
          if (error.code == "ENOENT") {
            res.writeHead(404, { "Content-Type": "text/html" });
            res.end("<h1>404 Not Found</h1>", "utf-8");
          } else {
            res.writeHead(500);
            res.end(
              "Sorry, check with the site admin for error: " +
                error.code +
                " ..\n"
            );
          }
        } else {
          res.writeHead(200, { "Content-Type": contentType });
          res.end(content, "utf-8");
        }
      });
    });
  }
}
