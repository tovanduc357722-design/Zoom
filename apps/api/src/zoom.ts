export interface ZoomProvider {
  createMeeting(
    callId: string,
  ): Promise<{ provider: string; externalId: string }>;
}
export class MockZoomProvider implements ZoomProvider {
  async createMeeting(callId: string) {
    return { provider: "mock", externalId: `demo-${callId}` };
  }
}
