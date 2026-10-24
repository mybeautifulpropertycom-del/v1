"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="state-screen">
      <span className="eyebrow">A SMALL PAUSE</span>
      <h1>Let’s try that again.</h1>
      <p>We couldn’t load this page. Please try again in a moment.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
