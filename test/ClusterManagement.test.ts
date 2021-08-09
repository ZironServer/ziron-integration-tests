/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import Cluster from "./utils/Cluster";
import {waitMs} from "./utils/Wait";

jest.setTimeout(18000);

describe('Cluster management tests', () => {

    const WORKER_PORTS = [3020,3021,3022,3023];
    let cluster = new Cluster();
    beforeEach(async () => {
        await cluster.init(5);
        await cluster.addServers(WORKER_PORTS);
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
});