export interface PushDispatcher {
  send(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void>;
  sendToTopic(
    topic: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void>;
}

export class StubPushDispatcher implements PushDispatcher {
  async send(fcmToken: string, title: string, _body: string): Promise<void> {
    console.log(`[StubPush] Token: ${fcmToken.substring(0, 10)}... | Title: ${title}`);
  }

  async sendToTopic(topic: string, title: string, _body: string): Promise<void> {
    console.log(`[StubPush] Topic: ${topic} | Title: ${title}`);
  }
}
