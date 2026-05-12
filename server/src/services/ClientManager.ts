import type { Client, PublicKeyJwk } from "../types";

export interface ClientManager {
  clients: Map<string, Client>;
}

export function createClientManager(): ClientManager {
  return {
    clients: new Map<string, Client>(),
  };
}

export function registerClient(manager: ClientManager, client: Client): void {
  manager.clients.set(client.id, client);
}

export function unregisterClient(
  manager: ClientManager,
  clientId: string,
): boolean {
  return manager.clients.delete(clientId);
}

export function getClient(
  manager: ClientManager,
  clientId: string,
): Client | undefined {
  return manager.clients.get(clientId);
}

export function getAllClients(manager: ClientManager): Client[] {
  return Array.from(manager.clients.values());
}

export function findClientBySocketId(
  manager: ClientManager,
  socketId: string,
): Client | undefined {
  return Array.from(manager.clients.values()).find(
    (client) => client.socketId === socketId,
  );
}

export function getPeerList(
  manager: ClientManager,
): Array<{ id: string; publicKey: PublicKeyJwk }> {
  return Array.from(manager.clients.values()).map((c) => ({
    id: c.id,
    publicKey: c.publicKey,
  }));
}
