declare module "better-sqlite3" {
  const Database: any;
  export default Database;
}

declare module "vectra" {
  export class LocalIndex<T = any> {
    constructor(path: string);
    isIndexCreated(): Promise<boolean>;
    createIndex(options: unknown): Promise<void>;
    batchInsertItems(items: Array<{ id: string; vector: number[]; metadata: T }>): Promise<void>;
    queryItems(queryVector: number[], queryText: string, topK: number): Promise<Array<{ item: { id?: string; metadata?: T }; score: number }>>;
    deleteIndex(): Promise<void>;
  }
}
