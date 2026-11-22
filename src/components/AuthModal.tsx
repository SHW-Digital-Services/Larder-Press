import React, { useEffect, useRef, useState } from 'react';
import { X, ShieldCheck, Mail, KeyRound, Loader2, ExternalLink } from 'lucide-react';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  firebaseConfig,
  type MultiFactorError,
  type MultiFactorResolver,
} from '../lib/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  contextMessage?: string;
}

type AuthTab = 'signin' | 'signup' | 'reset';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  contextMessage,
}) => {
  const [tab, setTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showConsoleHelp, setShowConsoleHelp] = useState(false);

  // MFA Challenge State
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [selectedHintIndex, setSelectedHintIndex] = useState(0);
  const [mfaCode, setMfaCode] = useState('');
  const [smsVerificationId, setSmsVerificationId] = useState<string | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setInfoMessage(null);
      setMfaResolver(null);
      setMfaCode('');
      setSmsVerificationId(null);
      setShowConsoleHelp(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // ignore
        }
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const formatAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      setShowConsoleHelp(true);
      return 'Email/Password sign-in is not yet enabled in your Firebase Authentication console. You can sign in immediately with Google below, or follow the setup guide to enable Email/Password.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account with this email already exists. Switch to Sign In instead.';
    }
    if (code === 'auth/weak-password') {
      return 'Password must be at least 6 characters long.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Sign-in window was closed before completion.';
    }
    if (code === 'auth/invalid-verification-code') {
      return 'The 6-digit MFA verification code is incorrect or expired.';
    }
    return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
  };

  const handleMfaRequired = (err: MultiFactorError) => {
    const resolver = getMultiFactorResolver(auth, err);
    setMfaResolver(resolver);
    setSelectedHintIndex(0);
    setMfaCode('');
    setSmsVerificationId(null);
    setError(null);
    setInfoMessage('Multi-factor verification is required for this account.');
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onSuccess?.();
      onClose();
    } catch (err) {
      const fbErr = err as MultiFactorError;
      if (fbErr?.code === 'auth/multi-factor-auth-required') {
        handleMfaRequired(fbErr);
      } else {
        setError(formatAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setShowConsoleHelp(false);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      if (tab === 'reset') {
        await sendPasswordResetEmail(auth, email.trim());
        setInfoMessage('Password reset email sent. Check your inbox for reset instructions.');
        return;
      }

      if (!password) {
        setError('Please enter your password.');
        return;
      }

      if (tab === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 120) });
        }
        await sendEmailVerification(cred.user);
        setInfoMessage(
          'Account created. We sent a verification link to your email — please click it to verify your account and unlock cloud saving.'
        );
        onSuccess?.();
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        onSuccess?.();
        onClose();
      }
    } catch (err) {
      const fbErr = err as MultiFactorError;
      if (fbErr?.code === 'auth/multi-factor-auth-required') {
        handleMfaRequired(fbErr);
      } else {
        setError(formatAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendSmsChallenge = async () => {
    if (!mfaResolver) return;
    const hint = mfaResolver.hints[selectedHintIndex];
    if (!hint || hint.factorId !== PhoneMultiFactorGenerator.FACTOR_ID) return;

    setLoading(true);
    setError(null);
    try {
      if (!recaptchaVerifierRef.current && recaptchaContainerRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
          size: 'invisible',
        });
      }
      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneAuthProvider.verifyPhoneNumber(
        {
          multiFactorHint: hint,
          session: mfaResolver.session,
        },
        recaptchaVerifierRef.current!
      );
      setSmsVerificationId(verificationId);
      setInfoMessage('SMS verification code sent to your registered phone.');
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaResolver || !mfaCode.trim()) return;
    const hint = mfaResolver.hints[selectedHintIndex];
    if (!hint) return;

    setLoading(true);
    setError(null);
    try {
      if (hint.factorId === TotpMultiFactorGenerator.FACTOR_ID) {
        const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, mfaCode.trim());
        await mfaResolver.resolveSignIn(assertion);
      } else if (hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID) {
        if (!smsVerificationId) {
          setError('Please send the SMS code first.');
          setLoading(false);
          return;
        }
        const cred = PhoneAuthProvider.credential(smsVerificationId, mfaCode.trim());
        const assertion = PhoneMultiFactorGenerator.assertion(cred);
        await mfaResolver.resolveSignIn(assertion);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const activeHint = mfaResolver?.hints[selectedHintIndex];
  const consoleAuthUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-md bg-white border border-stone-200 rounded-xl p-6 sm:p-8 shadow-xl max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sign in dialog"
          className="absolute top-4 right-4 p-2 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {mfaResolver ? (
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[#14532D] mb-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Two-Step Verification</span>
            </div>
            <h2 id="auth-modal-title" className="text-2xl font-semibold text-stone-900 mb-2">
              Enter your MFA code
            </h2>
            <p className="text-sm text-stone-600 mb-5">
              Complete sign-in using your enrolled second factor.
            </p>

            {mfaResolver.hints.length > 1 && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Verification method
                </label>
                <div className="flex flex-wrap gap-2">
                  {mfaResolver.hints.map((hint, idx) => (
                    <button
                      key={hint.uid}
                      type="button"
                      onClick={() => {
                        setSelectedHintIndex(idx);
                        setSmsVerificationId(null);
                        setMfaCode('');
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        selectedHintIndex === idx
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      {hint.displayName ||
                        (hint.factorId === TotpMultiFactorGenerator.FACTOR_ID
                          ? 'Authenticator App'
                          : 'Phone SMS')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeHint?.factorId === PhoneMultiFactorGenerator.FACTOR_ID && !smsVerificationId && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={handleSendSmsChallenge}
                  disabled={loading}
                  className="w-full py-2.5 px-4 text-sm font-medium text-stone-900 bg-stone-100 border border-stone-300 rounded-lg hover:bg-stone-200 transition-colors"
                >
                  Send SMS code to {(activeHint as { phoneNumber?: string }).phoneNumber || 'phone'}
                </button>
              </div>
            )}

            <form onSubmit={handleVerifyMfa} className="space-y-4">
              <div>
                <label htmlFor="mfa-code" className="block text-xs font-medium text-stone-700 mb-1.5">
                  6-digit verification code
                </label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="000000"
                  className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums tracking-widest border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                />
              </div>

              {error && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  {error}
                </p>
              )}
              {infoMessage && (
                <p className="text-xs text-[#14532D] bg-[#14532D]/5 border border-[#14532D]/20 rounded-lg p-3">
                  {infoMessage}
                </p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading || !mfaCode.trim()}
                  className="flex-1 py-2.5 px-4 text-sm font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Verify &amp; Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMfaResolver(null)}
                  className="py-2.5 px-4 text-sm font-medium text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-50"
                >
                  Back
                </button>
              </div>
            </form>
            <div ref={recaptchaContainerRef} />
          </div>
        ) : (
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-stone-500 mb-1.5">
              Larder Press Account
            </p>
            <h2 id="auth-modal-title" className="text-2xl font-semibold text-stone-900 mb-2">
              {tab === 'signin'
                ? 'Sign in to your cookbook'
                : tab === 'signup'
                ? 'Create your kitchen account'
                : 'Reset your password'}
            </h2>
            {contextMessage && (
              <p className="text-sm text-stone-600 mb-4">{contextMessage}</p>
            )}

            {/* Google Sign-In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-2.5 px-4 text-sm font-medium text-stone-900 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors flex items-center justify-center gap-2.5 mb-5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="relative flex items-center justify-center mb-5">
              <div className="border-t border-stone-200 w-full" />
              <span className="px-3 text-xs text-stone-400 bg-white whitespace-nowrap">
                or with email
              </span>
              <div className="border-t border-stone-200 w-full" />
            </div>

            {/* Segmented Mode Switch */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-stone-100 rounded-lg mb-4">
              <button
                type="button"
                onClick={() => {
                  setTab('signin');
                  setError(null);
                  setInfoMessage(null);
                }}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === 'signin'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('signup');
                  setError(null);
                  setInfoMessage(null);
                }}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === 'signup'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3.5">
              {tab === 'signup' && (
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-medium text-stone-700 mb-1">
                    Full Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Chef Name"
                    className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-stone-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                  />
                </div>
              </div>

              {tab !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="auth-password" className="block text-xs font-medium text-stone-700">
                      Password
                    </label>
                    {tab === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setTab('reset');
                          setError(null);
                          setInfoMessage(null);
                        }}
                        className="text-xs text-[#14532D] hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <p>{error}</p>
                  {showConsoleHelp && (
                    <a
                      href={consoleAuthUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium underline text-red-900"
                    >
                      <span>Open Firebase Auth Providers</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {infoMessage && (
                <p className="text-xs text-[#14532D] bg-[#14532D]/5 border border-[#14532D]/20 rounded-lg p-3">
                  {infoMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>
                  {tab === 'signin'
                    ? 'Sign In with Email'
                    : tab === 'signup'
                    ? 'Create Account'
                    : 'Send Reset Link'}
                </span>
              </button>

              {tab === 'reset' && (
                <button
                  type="button"
                  onClick={() => setTab('signin')}
                  className="w-full py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
                >
                  Back to Sign In
                </button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
