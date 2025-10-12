import React, { useState } from 'react';
import { 
  Mail, 
  KeyRound, 
  Fingerprint, 
  Shield,
  Key,
  Clock
} from 'lucide-react';
import { AuthButton } from './AuthButton';

// SVG Icons for OAuth providers
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6">
    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);

const MicrosoftIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path fill="#f25022" d="M1 1h10v10H1z"/>
    <path fill="#00a4ef" d="M13 1h10v10H13z"/>
    <path fill="#7fba00" d="M1 13h10v10H1z"/>
    <path fill="#ffb900" d="M13 13h10v10H13z"/>
  </svg>
);

const KakaoIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6">
    <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor">kakao</text>
  </svg>
);

const NaverIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <circle cx="12" cy="12" r="10"/>
  </svg>
);

const LineIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
  </svg>
);

export function LoginGateway({ client }: { client: any }) {
  const [email, setEmail] = useState('');
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [authMethod, setAuthMethod] = useState<'magiclink' | 'otp' | 'passkey' | null>(null);

  const handleOAuthLogin = async (provider: string) => {
    try {
      window.location.href = `/api/auth/signin/${provider}`;
    } catch (error) {
      console.error('OAuth error:', error);
    }
  };

  const handlePasskeyLogin = async () => {
    try {
      // Passkey authentication placeholder
      console.log('Passkey login - Configure passkey plugin in Better Auth');
      alert('Passkey authentication - Configure in Better Auth');
    } catch (error) {
      console.error('Passkey error:', error);
    }
  };

  const handleMagicLink = async () => {
    if (!email) return;
    try {
      // Magic link placeholder
      console.log('Magic link for:', email);
      alert('Magic link feature - Configure email service and Better Auth plugin');
    } catch (error) {
      console.error('Magic link error:', error);
    }
  };

  const handleEmailOTP = async () => {
    if (!email) return;
    try {
      // Email OTP placeholder
      console.log('Email OTP for:', email);
      alert('Email OTP feature - Configure email service and Better Auth plugin');
    } catch (error) {
      console.error('Email OTP error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-gray-800/50 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-gray-700">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-gray-400">Sign in to your account using your preferred method</p>
        </div>

        {/* Passwordless Methods */}
        <div className="space-y-3 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Passwordless</h2>
          
          <AuthButton
            provider="passkey"
            icon={<Fingerprint />}
            onClick={handlePasskeyLogin}
          >
            Sign in with Passkey
          </AuthButton>

          {!showEmailInput && (
            <AuthButton
              provider="email"
              icon={<Mail />}
              onClick={() => setShowEmailInput(true)}
            >
              Sign in with Email
            </AuthButton>
          )}

          {showEmailInput && (
            <div className="space-y-3">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-700/50 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleMagicLink}
                  className="px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Key className="w-5 h-5" />
                  Magic Link
                </button>
                <button
                  onClick={handleEmailOTP}
                  className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <KeyRound className="w-5 h-5" />
                  Email OTP
                </button>
              </div>
            </div>
          )}
        </div>

        {/* OAuth Providers */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">OAuth Providers</h2>
          
          <div className="grid grid-cols-2 gap-3">
            <AuthButton
              provider="google"
              icon={<GoogleIcon />}
              onClick={() => handleOAuthLogin('google')}
            >
              Google
            </AuthButton>

            <AuthButton
              provider="facebook"
              icon={<FacebookIcon />}
              onClick={() => handleOAuthLogin('facebook')}
            >
              Facebook
            </AuthButton>

            <AuthButton
              provider="apple"
              icon={<AppleIcon />}
              onClick={() => handleOAuthLogin('apple')}
            >
              Apple
            </AuthButton>

            <AuthButton
              provider="microsoft"
              icon={<MicrosoftIcon />}
              onClick={() => handleOAuthLogin('microsoft')}
            >
              Microsoft
            </AuthButton>

            <AuthButton
              provider="kakao"
              icon={<KakaoIcon />}
              onClick={() => handleOAuthLogin('kakao')}
            >
              Kakao
            </AuthButton>

            <AuthButton
              provider="naver"
              icon={<NaverIcon />}
              onClick={() => handleOAuthLogin('naver')}
            >
              Naver
            </AuthButton>

            <AuthButton
              provider="line"
              icon={<LineIcon />}
              onClick={() => handleOAuthLogin('line')}
            >
              Line
            </AuthButton>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-8 pt-6 border-t border-gray-700">
          <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>2FA Protected</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Session Management</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
