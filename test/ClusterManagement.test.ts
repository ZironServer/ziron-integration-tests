/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import Cluster from "./utils/Cluster";
import {waitMs} from "./utils/Wait";

jest.setTimeout(18000);

describe('Cluster management tests', () => {

    let cluster = new Cluster();
    beforeEach(async () => {
        await cluster.init(5);
        await Promise.all([
            cluster.addServer({port: 3020, clusterShared: 'hello'}),
            cluster.addServer({port: 3021, clusterShared: 'key'}),
            cluster.addServer({port: 3022, clusterShared: 'secret'}),
            cluster.addServer({port: 3023, clusterShared: 'password'}),
        ])
    })
    afterEach(async () => cluster.terminate());

    it("Should select a new worker leader when a worker leaves.", async () => {
        await waitMs(200);

        let leaders = cluster.getServers().filter(server => server.leader);
        expect(leaders.length).toBe(1);

        const currentLeader = leaders[0];
        cluster.terminate(currentLeader);

        await waitMs(2500);

        leaders = cluster.getServers().filter(server => server.leader);
        expect(leaders.length).toBe(1);
    });

    it("Should select only one leader after leaves and joins.", async () => {
        await waitMs(200);
        const servers = cluster.getServers();
        cluster.terminate(servers[0]);
        await cluster.addServer(3024);
        cluster.terminate(servers[1]);
        cluster.terminate(servers[2]);

        await waitMs(2500);

        const leaders = cluster.getServers().filter(server => server.leader);
        expect(leaders.length).toBe(1);
    });

    it("All workers/nodes should have the same cluster shared data.", async () => {
        await waitMs(200);
        const servers = cluster.getServers();
        expect(servers.every(server => server.shared === servers[0].shared)).toBe(true);
    });

    it("All workers/nodes should have the same auth keys in a cluster.", async () => {
        await waitMs(200);
        const servers = cluster.getServers();
        expect(servers.every(server =>
            server.auth.options.publicKey === servers[0].auth.options.publicKey &&
            server.auth.options.privateKey === servers[0].auth.options.privateKey &&
            server.auth.options.algorithm === servers[0].auth.options.algorithm
        )).toBe(true);
    });

    it("All workers/nodes should have the same cluster session id in a cluster.", async () => {
        await waitMs(200);
        const servers = cluster.getServers();

        expect(typeof servers[0].stateClient?.clusterSessionId).toBe('string');
        expect(servers.every(server =>
            server.stateClient?.clusterSessionId === servers[0].stateClient?.clusterSessionId)
        ).toBe(true);
    });
});