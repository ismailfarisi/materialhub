import { AppDataSource, ProductQuestion } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

export class ProductQuestionService {
  private get repo() {
    return AppDataSource.getRepository(ProductQuestion);
  }

  async ask(productId: string, userId: string, question: string) {
    return this.repo.save(
      this.repo.create({
        product_id: productId,
        user_id: userId,
        question,
        is_published: false,
      }),
    );
  }

  async answer(productId: string, questionId: string, vendorUserId: string, answer: string) {
    const q = await this.repo.findOne({ where: { id: questionId, product_id: productId } });
    if (!q) throw new HttpError(404, "Question not found", "QUESTION_NOT_FOUND");
    q.answer = answer;
    q.answered_by = vendorUserId;
    q.answered_at = new Date();
    q.is_published = true;
    return this.repo.save(q);
  }

  async list(productId: string) {
    return this.repo.find({
      where: { product_id: productId, is_published: true },
      order: { created_at: "DESC" },
    });
  }
}
