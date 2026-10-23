import { httpsCallable } from 'firebase/functions';
import type {
  AddTaskReq, AddTaskRes, CreateGameReq, CreateGameRes, DeleteTaskReq, EndGameReq, JoinGameReq, JoinGameRes,
  LaunchGameReq, ResolveReclaimReq, ToggleMarkReq, ToggleMarkRes, TransferHostReq, WhoAmIReq, WhoAmIRes,
} from 'game-core';
import { firebase } from './app';
import { ensureSignedIn } from './session';

async function call<Req, Res>(name: string, req: Req): Promise<Res> {
  await ensureSignedIn();
  const res = await httpsCallable<Req, Res>(firebase().fns, name)(req);
  return res.data;
}

/** Typed wrappers over the backend callables. */
export const api = {
  createGame: (r: CreateGameReq) => call<CreateGameReq, CreateGameRes>('createGame', r),
  joinGame: (r: JoinGameReq) => call<JoinGameReq, JoinGameRes>('joinGame', r),
  whoAmI: (r: WhoAmIReq) => call<WhoAmIReq, WhoAmIRes>('whoAmI', r),
  addTask: (r: AddTaskReq) => call<AddTaskReq, AddTaskRes>('addTask', r),
  deleteTask: (r: DeleteTaskReq) => call<DeleteTaskReq, unknown>('deleteTask', r),
  launchGame: (r: LaunchGameReq) => call<LaunchGameReq, unknown>('launchGame', r),
  toggleMark: (r: ToggleMarkReq) => call<ToggleMarkReq, ToggleMarkRes>('toggleMark', r),
  endGame: (r: EndGameReq) => call<EndGameReq, unknown>('endGame', r),
  resolveReclaim: (r: ResolveReclaimReq) => call<ResolveReclaimReq, unknown>('resolveReclaim', r),
  transferHost: (r: TransferHostReq) => call<TransferHostReq, unknown>('transferHost', r),
};
