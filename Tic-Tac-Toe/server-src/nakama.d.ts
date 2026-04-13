declare namespace nkruntime {
  export interface Context {
    env: { [key: string]: string };
    executionMode: string;
    headers: { [key: string]: string[] };
    queryParams: { [key: string]: string[] };
    userId: string;
    username: string;
    vars: { [key: string]: string };
    userSessionExp: number;
    clientIP: string;
    clientPort: string;
  }

  export interface Logger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
  }

  export interface Nakama {
    matchCreate(module: string, params?: { [key: string]: any }): string;
    matchList(limit: number, authoritative: boolean, label: string, minSize: number, maxSize: number, query?: string): Match[];
    binaryToString(data: Uint8Array): string;
    stringToBinary(str: string): Uint8Array;
  }

  export interface Match {
    matchId: string;
    authoritative: boolean;
    size: number;
  }

  export interface Presence {
    userId: string;
    sessionId: string;
    username: string;
    node: string;
  }

  export interface MatchDispatcher {
    broadcastMessage(opCode: number, data: string | Uint8Array, presences?: Presence[] | null, sender?: Presence | null): void;
    matchKick(presences: Presence[]): void;
    matchLabelUpdate(label: string): void;
  }

  export interface MatchMessage {
    sender: Presence;
    opCode: number;
    data: Uint8Array;
  }

  export interface MatchInitFunction<T> {
    (ctx: Context, logger: Logger, nk: Nakama, params: { [key: string]: string }): {
      state: T;
      tickRate: number;
      label: string;
    };
  }

  export interface MatchJoinAttemptFunction<T> {
    (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: T, presence: Presence, metadata: { [key: string]: any }): {
      state: T;
      accept: boolean;
      rejectMessage?: string;
    } | null;
  }

  export interface MatchJoinFunction<T> {
    (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: T, presences: Presence[]): {
      state: T;
    } | null;
  }

  export interface MatchLeaveFunction<T> {
    (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: T, presences: Presence[]): {
      state: T;
    } | null;
  }

  export interface MatchLoopFunction<T> {
    (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: T, messages: MatchMessage[]): {
      state: T;
    } | null;
  }

  export interface MatchTerminateFunction<T> {
    (ctx: Context, logger: Logger, nk: Nakama, dispatcher: MatchDispatcher, tick: number, state: T, graceSeconds: number): {
      state: T;
    } | null;
  }

  export interface RpcFunction {
    (ctx: Context, logger: Logger, nk: Nakama, payload: string): string;
  }

  export interface Initializer {
    registerMatch(name: string, handlers: {
      matchInit: MatchInitFunction<any>;
      matchJoinAttempt: MatchJoinAttemptFunction<any>;
      matchJoin: MatchJoinFunction<any>;
      matchLeave: MatchLeaveFunction<any>;
      matchLoop: MatchLoopFunction<any>;
      matchTerminate: MatchTerminateFunction<any>;
    }): void;
    registerRpc(id: string, fn: RpcFunction): void;
  }
}
