import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ShieldCheck,
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import {
  auth,
  googleProvider,
  multiFactor,
  TotpMultiFactorGenerator,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  sendEmailVerification,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider,
  firebaseConfig,
  type User,
  type TotpSecret,
} from '../lib/firebase';

interface AccountSecurityViewProps {
  user: User | null;
  onOpenAuth: () => void;
  onUserRefreshed: () => Promise<void>;
}

export const AccountSecurityView: React.FC<AccountSecurityViewProps> = ({
  user,
  onOpenAuth,
  onUserRefreshed,
}) => {
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [totpCode, setTotpCode] = useState('');
  const [totpLabel, setTotpLabel] = useState('Authenticator App');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsVerificationId, setSmsVerificationId] = useState<string | null>(null);

  const [reauthPassword, setReauthPassword] = useState('');
  const [needsReauth, setNeedsReauth] = useState(false);

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [enrolledCount, setEnrolledCount] = useState(0);

  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (user) {
      setEnrolledCount(multiFactor(user).enrolledFactors.length);
    } else {
      setEnrolledCount(0);
    }
  }, [user]);

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

  if (!user) {
    return (
      <section className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-white border border-stone-200 rounded-xl p-8">
          <p className="text-xs font-medium uppercase tracking-widest text-stone-500 mb-2">
            Account &amp; Security
          </p>
          <h1 className="font-editorial text-3xl font-semibold text-stone-900 mb-3">
            Sign in to manage Multi-Factor Authentication
          </h1>
          <p className="text-sm text-stone-600 leading-relaxed mb-6 max-w-xl">
            Larder Press supports Google Sign-In, Email &amp; Password authentication, and
            Multi-Factor Authentication (Authenticator App TOTP or SMS). Sign in to enroll or
            manage your security factors.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] transition-colors"
          >
            Sign In or Create Account
          </button>
        </div>
      </section>
    );
  }

  const enrolledFactors = multiFactor(user).enrolledFactors;
  const consoleAuthUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;
  const consoleProvidersUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;

  const handleRefreshEmailStatus = async () => {
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await onUserRefreshed();
      if (auth.currentUser?.emailVerified) {
        setStatusMessage('Email verified! Cloud recipe saving and MFA enrollment are unlocked.');
      } else {
        setErrorMessage('Email is still marked unverified. Please click the verification link in your inbox.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to refresh status.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await sendEmailVerification(user);
      setStatusMessage(`Verification email resent to ${user.email}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  const handleReauthenticate = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const isPasswordUser = user.providerData.some((p) => p.providerId === 'password');
      if (isPasswordUser && user.email) {
        if (!reauthPassword) {
          setErrorMessage('Enter your current password to confirm your identity.');
          setLoading(false);
          return;
        }
        const cred = EmailAuthProvider.credential(user.email, reauthPassword);
        await reauthenticateWithCredential(user, cred);
      } else {
        await reauthenticateWithPopup(user, googleProvider);
      }
      setNeedsReauth(false);
      setReauthPassword('');
      setStatusMessage('Identity re-confirmed. You may now enroll or remove an MFA factor.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Re-authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTotpEnrollment = async () => {
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const session = await multiFactor(user).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      const otpAuthUrl = secret.generateQrCodeUrl(
        user.email || user.uid,
        'Larder Press'
      );
      const dataUrl = await QRCode.toDataURL(otpAuthUrl, { width: 200, margin: 1 });
      setTotpSecret(secret);
      setQrDataUrl(dataUrl);
      setTotpCode('');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/requires-recent-login') {
        setNeedsReauth(true);
        setErrorMessage('Please confirm your identity (recent sign-in required) before enrolling MFA.');
      } else if (code === 'auth/operation-not-allowed' || code === 'auth/unsupported-first-factor') {
        setErrorMessage(
          'TOTP MFA is not enabled yet in Firebase Console. Enable TOTP under Authentication > Settings > Multi-factor authentication.'
        );
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Unable to start TOTP setup.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpSecret || !totpCode.trim()) return;

    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        totpCode.trim()
      );
      await multiFactor(user).enroll(assertion, totpLabel.trim() || 'Authenticator App');
      setTotpSecret(null);
      setQrDataUrl('');
      setTotpCode('');
      setEnrolledCount(multiFactor(user).enrolledFactors.length);
      setStatusMessage('Authenticator App MFA has been enabled on your account.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid TOTP verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendPhoneEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      if (!recaptchaVerifierRef.current && recaptchaContainerRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
          size: 'invisible',
        });
      }
      const session = await multiFactor(user).getSession();
      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneAuthProvider.verifyPhoneNumber(
        { phoneNumber: phoneNumber.trim(), session },
        recaptchaVerifierRef.current!
      );
      setSmsVerificationId(verificationId);
      setStatusMessage('SMS verification code sent. Enter the 6-digit code below to finish enrollment.');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/requires-recent-login') {
        setNeedsReauth(true);
        setErrorMessage('Please confirm your identity before enrolling SMS MFA.');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Could not send SMS verification code.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizePhoneEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsVerificationId || !smsCode.trim()) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const cred = PhoneAuthProvider.credential(smsVerificationId, smsCode.trim());
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await multiFactor(user).enroll(assertion, `SMS (${phoneNumber.trim()})`);
      setSmsVerificationId(null);
      setSmsCode('');
      setPhoneNumber('');
      setEnrolledCount(multiFactor(user).enrolledFactors.length);
      setStatusMessage('Phone SMS MFA has been enabled on your account.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to verify SMS code.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnenrollFactor = async (factorUid: string) => {
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await multiFactor(user).unenroll(factorUid);
      setEnrolledCount(multiFactor(user).enrolledFactors.length);
      setStatusMessage('MFA factor removed.');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/requires-recent-login') {
        setNeedsReauth(true);
        setErrorMessage('Please confirm your identity before removing an MFA factor.');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Could not remove MFA factor.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      <div className="border-b border-stone-200 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-stone-500 mb-1.5">
            Account &amp; Security
          </p>
          <h1 className="font-editorial text-3xl font-semibold text-stone-900">
            Authentication &amp; Multi-Factor Protection
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600">
            <span>Signed in as {user.displayName || user.email}</span>
            <span aria-hidden="true">·</span>
            <span>{user.email}</span>
            <span aria-hidden="true">·</span>
            <span className={user.emailVerified ? 'text-[#14532D] font-medium' : 'text-amber-700 font-medium'}>
              {user.emailVerified ? 'Email verified' : 'Email verification pending'}
            </span>
          </div>
        </div>
      </div>

      {!user.emailVerified && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Verify your email address to enable cloud saving &amp; MFA</span>
            </div>
            <p className="text-xs text-amber-800">
              Check your inbox for the Firebase verification link, then click Refresh Status.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={loading}
              className="px-3.5 py-2 text-xs font-medium text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
            >
              Resend Email
            </button>
            <button
              type="button"
              onClick={handleRefreshEmailStatus}
              disabled={loading}
              className="px-3.5 py-2 text-xs font-medium text-white bg-amber-900 rounded-lg hover:bg-amber-950 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="bg-[#14532D]/5 border border-[#14532D]/20 text-[#14532D] rounded-xl p-4 text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {needsReauth && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-stone-900">Confirm recent sign-in</h2>
          <p className="text-xs text-stone-600">
            Changing multi-factor settings requires a fresh login confirmation.
          </p>
          {user.providerData.some((p) => p.providerId === 'password') && (
            <input
              type="password"
              value={reauthPassword}
              onChange={(e) => setReauthPassword(e.target.value)}
              placeholder="Current password"
              className="w-full max-w-sm px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]"
            />
          )}
          <div>
            <button
              type="button"
              onClick={handleReauthenticate}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] transition-colors"
            >
              Confirm Identity
            </button>
          </div>
        </div>
      )}

      {/* Enrolled Factors */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#14532D]" />
            <h2 className="text-lg font-semibold text-stone-900">
              Enrolled Second Factors ({enrolledCount})
            </h2>
          </div>
        </div>

        {enrolledFactors.length === 0 ? (
          <p className="text-sm text-stone-600">
            No MFA factor is enrolled yet. Add an Authenticator App (TOTP) or Phone SMS below to
            protect your saved recipes.
          </p>
        ) : (
          <div className="divide-y divide-stone-200 border-t border-stone-200">
            {enrolledFactors.map((factor) => (
              <div key={factor.uid} className="py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-stone-900">
                    {factor.displayName || 'Second Factor'}
                  </p>
                  <p className="text-xs text-stone-500">
                    {factor.factorId === TotpMultiFactorGenerator.FACTOR_ID
                      ? 'TOTP Authenticator App'
                      : 'SMS Verification'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnenrollFactor(factor.uid)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enroll TOTP & SMS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TOTP Card */}
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-[#14532D]" />
            <h3 className="text-base font-semibold text-stone-900">Authenticator App (TOTP)</h3>
          </div>
          <p className="text-xs text-stone-600 leading-relaxed">
            Pair Google Authenticator, 1Password, or Authy to generate 6-digit verification codes
            at login.
          </p>

          {!totpSecret ? (
            <button
              type="button"
              onClick={handleStartTotpEnrollment}
              disabled={loading || !user.emailVerified}
              className="px-4 py-2 text-xs font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534] disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Set Up Authenticator App</span>
            </button>
          ) : (
            <form onSubmit={handleFinalizeTotp} className="space-y-4 pt-2 border-t border-stone-200">
              {qrDataUrl && (
                <div className="flex flex-col items-start gap-2">
                  <img
                    src={qrDataUrl}
                    alt="Scan this QR code with your authenticator app"
                    className="w-40 h-40 border border-stone-200 rounded-lg p-1.5 bg-white"
                  />
                  <p className="text-[11px] font-mono text-stone-600 break-all">
                    Manual key: {totpSecret.secretKey}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Device label
                </label>
                <input
                  type="text"
                  value={totpLabel}
                  onChange={(e) => setTotpLabel(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Enter 6-digit code from app
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums tracking-widest border border-stone-300 rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534]"
                >
                  Verify &amp; Enable
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTotpSecret(null);
                    setQrDataUrl('');
                  }}
                  className="px-3 py-2 text-xs font-medium text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* SMS Card */}
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[#14532D]" />
            <h3 className="text-base font-semibold text-stone-900">Phone SMS Verification</h3>
          </div>
          <p className="text-xs text-stone-600 leading-relaxed">
            Receive a one-time SMS verification code when signing in from a new device.
          </p>

          {!smsVerificationId ? (
            <form onSubmit={handleSendPhoneEnrollment} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Phone number (E.164 format)
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+15551234567"
                  className="w-full px-3 py-2 text-xs font-mono border border-stone-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !user.emailVerified || !phoneNumber.trim()}
                className="px-4 py-2 text-xs font-medium text-stone-900 bg-stone-100 border border-stone-300 rounded-lg hover:bg-stone-200 disabled:opacity-50 transition-colors"
              >
                Send SMS Verification Code
              </button>
            </form>
          ) : (
            <form onSubmit={handleFinalizePhoneEnrollment} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  6-digit SMS code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-stone-300 rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#14532D] rounded-lg hover:bg-[#166534]"
                >
                  Confirm Phone MFA
                </button>
                <button
                  type="button"
                  onClick={() => setSmsVerificationId(null)}
                  className="px-3 py-2 text-xs font-medium text-stone-600 border border-stone-300 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div ref={recaptchaContainerRef} />
        </div>
      </div>

      {/* Firebase Console Provider Setup Guide */}
      <div className="bg-stone-100/80 border border-stone-200 rounded-xl p-6 space-y-3">
        <h3 className="text-sm font-semibold text-stone-900">
          Firebase Console Configuration Checklist
        </h3>
        <p className="text-xs text-stone-600 leading-relaxed">
          Google Sign-In is provisioned automatically. To use Email &amp; Password sign-up and
          Multi-Factor Authentication (TOTP / SMS), verify these two settings in your Firebase
          Console:
        </p>
        <ol className="list-decimal list-inside text-xs text-stone-700 space-y-1.5">
          <li>
            Under <strong>Authentication &rarr; Sign-in method</strong>, click{' '}
            <strong>Add new provider</strong> and enable <strong>Email/Password</strong>.
          </li>
          <li>
            Under <strong>Authentication &rarr; Settings &rarr; Multi-factor authentication</strong>{' '}
            (requires Firebase Auth with Identity Platform), enable <strong>TOTP</strong> and/or{' '}
            <strong>SMS</strong>.
          </li>
        </ol>
        <div className="flex flex-wrap gap-4 pt-1 text-xs font-medium">
          <a
            href={consoleProvidersUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#14532D] hover:underline"
          >
            <span>Open Sign-in Providers</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={consoleAuthUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#14532D] hover:underline"
          >
            <span>Open MFA Settings</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </section>
  );
};
