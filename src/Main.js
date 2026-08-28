"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = void 0;
const typeorm_1 = require("typeorm");
class Server {
    async initialize(db) {
        console.log("connection initialized");
        this.conn = await (0, typeorm_1.createConnection)(db);
    }
}
exports.Server = Server;
;
//# sourceMappingURL=Main.js.map