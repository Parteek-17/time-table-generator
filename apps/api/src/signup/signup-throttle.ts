/**
 * In-memory limits on public sign-ups, so the form can't be used to mass-create institutes or
 * send invite emails to strangers. Per API process: good enough for one instance; move it to
 * Redis when the API runs on several.
 */
export class SignupThrottle {
  private readonly hits = new Map<string, number[]>();

  constructor(
    /** Per email address. */
    private readonly perEmail = { max: 3, windowMs: 24 * 3_600_000 },
    /** Across everyone. */
    private readonly overall = { max: 60, windowMs: 3_600_000 },
  ) {}

  /** Records the attempt and says whether it is allowed. */
  allow(email: string, now = Date.now()): boolean {
    const emailOk = this.take(`email:${email}`, this.perEmail, now);
    const overallOk = this.take('all', this.overall, now);
    return emailOk && overallOk;
  }

  private take(key: string, limit: { max: number; windowMs: number }, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < limit.windowMs);
    if (recent.length >= limit.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
