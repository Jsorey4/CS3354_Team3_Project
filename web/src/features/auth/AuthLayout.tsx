/**
 * @author Tyler Gaines
 * @description The centered frame shared by the login, sign-up and reset-password screens, matching
 *   login.html / signup.html / reset-password.html: the gold hammer logo and wordmark above a 440px card with
 *   a centered title and subtitle. Also exports the 48px input and 52px button styles those screens use.
 * @traces UC-08, UC-09, UC-11, SE-NFR-05
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Mockup .input (48px) and .btn (52px, 12px radius) on the auth screens. */
export const AUTH_INPUT = 'input h-12 px-4';
export const AUTH_BUTTON = 'btn-primary h-[52px] w-full rounded-xl text-base';

export function AuthLayout({ title, subtitle, children, footer, below }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; below?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-16">
      <Link to="/" className="flex flex-col items-center" aria-label="ProjectForge home">
        <img src="/logo.png" alt="" className="block h-16 w-auto" />
        <span className="mt-4 text-[28px] font-bold leading-9 tracking-[-0.02em] text-gold">ProjectForge</span>
      </Link>
      <main className="card mt-8 w-full max-w-[440px] p-8 shadow-pop sm:p-10">
        <h1 className="text-center text-[28px] font-extrabold leading-9 tracking-[-0.02em] text-ink">{title}</h1>
        {subtitle ? <p className="mt-2 text-center text-[15px] leading-[22px] text-body">{subtitle}</p> : null}
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-6 text-center text-[15px] leading-[22px] text-body">{footer}</div> : null}
      </main>
      {below ? <div className="mt-6 w-full max-w-[440px]">{below}</div> : null}
    </div>
  );
}
