declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    TEACHER_EMAILS?: string;
    BUCKET?: R2Bucket;
  }
}
