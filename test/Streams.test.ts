/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Cluster from "./utils/Cluster";
import ClientHelper from "./utils/ClientHelper";
import {ReadStream, StreamCloseCode, WriteStream} from "ziron-client";

jest.setTimeout(20000);

describe('Stream tests', () => {

    const PORT = 3030;
    const cluster = new Cluster();

    beforeAll(async () => {
        await cluster.init(1);
        const server = await cluster.addServer(PORT);
        server.connectionHandler = (socket) => {
            socket.procedures.readAll = async (data, end) => {
                const stream: ReadStream = data.stream;
                stream.accept();
                const chunks = await stream.readAll();
                end({chunks, closedSuccessfully: stream.closedSuccessfully});
            };
            socket.procedures.iterate = async (data, end) => {
                const stream: ReadStream<ArrayBuffer> = data.stream;
                stream.accept();
                const sizes: number[] = [];
                for await (const chunk of stream) sizes.push(chunk.byteLength);
                end({sizes, closedSuccessfully: stream.closedSuccessfully});
            };
            socket.procedures.download = (data, end) => {
                const stream = new WriteStream();
                (async () => {
                    for(let i = 0; i < data.count; i++) await stream.write({i});
                    await stream.end();
                })();
                end({stream}, true);
            };
            socket.procedures.abort = (data, end) => {
                const stream: ReadStream = data.stream;
                stream.close(StreamCloseCode.Abort);
                end();
            };
        }
    });
    afterAll(() => cluster.terminate());

    const clientHelper = new ClientHelper();
    beforeEach(async () => {
        clientHelper.createClient(PORT, 1);
        await clientHelper.connectAll();
    });
    afterEach(() => clientHelper.clear());

    it("Should upload all object chunks and end the stream successfully.", async () => {
        const socket = clientHelper.getClient(PORT);
        const stream = new WriteStream();
        const resPromise = socket.invoke('readAll', {stream}, {processComplexTypes: true});
        for(let i = 0; i < 25; i++) expect(await stream.write({i})).toBe(true);
        expect(await stream.end()).toBe(true);
        const res = await resPromise;
        expect(res.chunks).toStrictEqual(Array.from({length: 25}, (_, i) => ({i})));
        expect(res.closedSuccessfully).toBe(true);
        expect(await stream.closed).toBe(StreamCloseCode.End);
    });

    it("Should upload binary chunks that can be consumed with the async iterator.", async () => {
        const socket = clientHelper.getClient(PORT);
        const stream = new WriteStream<true>(true);
        const resPromise = socket.invoke('iterate', {stream}, {processComplexTypes: true});
        const sizes = [10, 300, 1, 5000, 42];
        for(const size of sizes) await stream.write(new ArrayBuffer(size));
        await stream.end();
        const res = await resPromise;
        expect(res.sizes).toStrictEqual(sizes);
        expect(res.closedSuccessfully).toBe(true);
    });

    it("Should end a stream with the last chunk.", async () => {
        const socket = clientHelper.getClient(PORT);
        const stream = new WriteStream();
        const resPromise = socket.invoke('readAll', {stream}, {processComplexTypes: true});
        await stream.write('a');
        await stream.end('b');
        const res = await resPromise;
        expect(res.chunks).toStrictEqual(['a', 'b']);
        expect(res.closedSuccessfully).toBe(true);
    });

    it("Should download a stream from the server.", async () => {
        const socket = clientHelper.getClient(PORT);
        const {stream} = await socket.invoke('download', {count: 15});
        expect(stream).toBeInstanceOf(ReadStream);
        stream.accept();
        const chunks = await stream.readAll();
        expect(chunks).toStrictEqual(Array.from({length: 15}, (_, i) => ({i})));
        expect(stream.closedSuccessfully).toBe(true);
    });

    it("Should resolve pending writes with false when the stream is aborted before it was accepted.", async () => {
        const socket = clientHelper.getClient(PORT);
        const stream = new WriteStream();
        const writePromise = stream.write('hello');
        await socket.invoke('abort', {stream}, {processComplexTypes: true});
        expect(await writePromise).toBe(false);
        expect(await stream.closed).toBe(StreamCloseCode.Abort);
        expect(stream.closedSuccessfully).toBe(false);
    });

    it("Should close streams with a bad connection when the socket disconnects.", async () => {
        const socket = clientHelper.getClient(PORT);
        const stream = new WriteStream();
        socket.invoke('readAll', {stream}, {processComplexTypes: true}).catch(() => {});
        await stream.write('first');
        socket.disconnect();
        expect(await stream.closed).toBe(StreamCloseCode.BadConnection);
        expect(await stream.write('second')).toBe(false);
    });
});
