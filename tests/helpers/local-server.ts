import { createServer, type Server } from "node:http";

export interface FixtureServer {
  readonly origin: string;
  close(): Promise<void>;
  url(pathname: string): string;
}

export function startFixtureServer(
  routes: Readonly<Record<string, string>>
): Promise<FixtureServer> {
  const server = createServer((request, response) => {
    const pathname = request.url?.split("?")[0] ?? "/";
    const body = routes[pathname];

    if (body === undefined) {
      response.writeHead(404, { "content-type": "text/plain;charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html;charset=utf-8"
    });
    response.end(body);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();

      if (address === null || typeof address === "string") {
        reject(new Error("Fixture server did not bind to a local TCP port."));
        return;
      }

      resolve(createFixtureServer(server, `http://127.0.0.1:${address.port}`));
    });
  });
}

function createFixtureServer(server: Server, origin: string): FixtureServer {
  return {
    origin,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    url: (pathname: string) => new URL(pathname, origin).toString()
  };
}
