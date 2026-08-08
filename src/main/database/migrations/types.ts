export interface DatabaseMigration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}
