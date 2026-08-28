import { createConnection, Connection } from "typeorm";
import db from "./ormconfig.json";

export class Server{
    conn : Connection
    async initialize (db){
        console.log("connection initialized");
        this.conn = await createConnection(db); 
    }
};