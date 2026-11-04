/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import * as http from "http";
import {Socket as NetSocket} from "net";
import {randomBytes} from "crypto";
import Cluster from "./utils/Cluster";
import {Socket, UpgradeRequest} from "ziron-worker";

jest.setTimeout(30000);

const PORT = 3060;
const IPV4_LOOPBACK = /^(127\.0\.0\.1|(0000:){5}ffff:7f00:0001)$/;

/**
 * Opens a raw websocket upgrade with the given extra headers and
 * resolves with the local port of the connection once the server switched protocols.
 */
function upgrade(headers: Record<string, string> = {}): Promise<{localPort: number, connection: NetSocket}> {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port: PORT,
            path: '/',
            headers: {
                'Connection': 'Upgrade',
                'Upgrade': 'websocket',
                'Sec-WebSocket-Version': '13',
                'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
                'Sec-WebSocket-Protocol': 'ziron',
                ...headers
            }
        });
        req.on('upgrade', (_res, connection: NetSocket) =>
            resolve({localPort: connection.localPort!, connection}));
        req.on('response', res => reject(new Error(`No upgrade: ${res.statusCode}`)));
        req.on('error', reject);
        req.end();
    });
}

describe('Peer address tests', () => {

    const cluster = new Cluster();
    let connected: (socket: Socket) => void = () => {};
    let upgraded: (req: UpgradeRequest) => void = () => {};

    beforeAll(async () => {
        await cluster.init(1);
        const server = await cluster.addServer(PORT);
        server.upgradeMiddleware = req => upgraded(req);
        server.connectionHandler = socket => connected(socket);
    });
    afterAll(() => cluster.terminate());

    const nextSocket = () => new Promise<Socket>(resolve => connected = resolve);

    it("Should keep the TCP peer of the upgrade on the socket.", async () => {
        const socketPromise = nextSocket();
        const {localPort, connection} = await upgrade();
        const socket = await socketPromise;
        connection.destroy();

        expect(socket.peerAddress).toMatch(IPV4_LOOPBACK);
        expect(socket.peerPort).toBe(localPort);
        expect(socket.forwardedFor).toBe('');
        expect(socket.remoteAddress).toBe(socket.peerAddress);
    });

    it("Should give the raw X-Forwarded-For header without taking it as the peer.", async () => {
        const socketPromise = nextSocket();
        const {connection} = await upgrade({'X-Forwarded-For': '203.0.113.7, 198.51.100.1'});
        const socket = await socketPromise;
        connection.destroy();

        expect(socket.peerAddress).toMatch(IPV4_LOOPBACK);
        expect(socket.forwardedFor).toBe('203.0.113.7, 198.51.100.1');
        // Unchanged: the first forwarded address.
        expect(socket.remoteAddress).toBe('203.0.113.7');
    });

    it("Should know the peer already in the upgrade middleware.", async () => {
        const reqPromise = new Promise<UpgradeRequest>(resolve => upgraded = resolve);
        const socketPromise = nextSocket();
        const {localPort, connection} = await upgrade();
        const req = await reqPromise;
        await socketPromise;
        connection.destroy();
        upgraded = () => {};

        expect(req.peerAddress).toMatch(IPV4_LOOPBACK);
        expect(req.peerPort).toBe(localPort);
    });
});
