import { randomRoomCode } from "./codes";
import { getLimiter } from "./limits";
import { Room } from "./room";
import {
  createRouter,
  dailyCap,
  type RouteDeps,
  type RoomBudget,
} from "./routes";
import { consumeDailyRoom } from "./stats";

export { Room };

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return createRouter(routeDeps(env))(request);
  },
};

/** Wires the Worker bindings into the pure router. */
function routeDeps(env: Env): RouteDeps {
  return {
    rooms: env.ROOMS,
    budget: roomBudget(env.DB, dailyCap(env.DAILY_ROOM_CAP)),
    limiters: {
      create: getLimiter(env, "CREATE_LIMITER"),
      join: getLimiter(env, "JOIN_LIMITER"),
    },
    assets: env.ASSETS,
    now: () => Date.now(),
    newHostToken: () => crypto.randomUUID(),
    newRoomCode: randomRoomCode,
  };
}

function roomBudget(db: D1Database, cap: number): RoomBudget {
  return { tryConsume: (day) => consumeDailyRoom(db, day, cap) };
}