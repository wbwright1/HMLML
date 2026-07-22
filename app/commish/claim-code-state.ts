// Shared action-state shape for the claim-code issue flow. Kept OUT of
// actions.ts because a "use server" module may only export async functions;
// this plain constant/type is imported by both the server action and the
// client island that reveals the returned code.

export interface IssueCodeState {
  memberId: number | null;
  code: string | null;
  error: string | null;
}

export const ISSUE_CODE_INITIAL: IssueCodeState = {
  memberId: null,
  code: null,
  error: null,
};
