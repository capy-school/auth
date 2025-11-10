import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';

interface TwoFactorSetupProps {
  userEmail?: string;
}

export default function TwoFactorSetup({ userEmail = 'user@example.com' }: TwoFactorSetupProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const STORAGE_KEY = '2fa_enabled';

  useEffect(() => {
    // Check if 2FA is already enabled
    const enabled = localStorage.getItem(STORAGE_KEY) === 'true';
    setIsEnabled(enabled);
  }, []);

  const generateSecret = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 16; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  };

  const formatSecret = (secret: string) => {
    return secret.match(/.{1,4}/g)?.join(' ') || secret;
  };

  const generateBackupCodes = () => {
    const codes = [];
    for (let i = 0; i < 4; i++) {
      const code = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + 
                   Math.random().toString(36).substring(2, 6).toUpperCase();
      codes.push(code);
    }
    return codes;
  };

  const generateQRCode = async (secret: string) => {
    if (!canvasRef.current) return;

    const otpauth = `otpauth://totp/CapySchool:${encodeURIComponent(userEmail)}?secret=${secret}&issuer=CapySchool`;
    
    try {
      await QRCode.toCanvas(canvasRef.current, otpauth, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const handleEnableClick = () => {
    const newSecret = generateSecret();
    setSecret(newSecret);
    setIsEnabling(true);
    
    // Generate QR code after state updates
    setTimeout(() => {
      generateQRCode(newSecret);
    }, 100);
  };

  const handleVerifyCode = () => {
    // In a real app, verify the code with the backend
    if (verificationCode.length === 6) {
      const codes = generateBackupCodes();
      setBackupCodes(codes);
      localStorage.setItem(STORAGE_KEY, 'true');
      setIsEnabled(true);
      
      // Show backup codes section
      const backupSection = document.getElementById('backupCodes');
      if (backupSection) {
        backupSection.classList.remove('hidden');
      }
      
      alert('Two-factor authentication has been enabled successfully!');
    } else {
      alert('Please enter a valid 6-digit code');
    }
  };

  const handleDisable = () => {
    if (confirm('Are you sure you want to disable two-factor authentication?')) {
      localStorage.removeItem(STORAGE_KEY);
      setIsEnabled(false);
      setIsEnabling(false);
      setSecret('');
      setVerificationCode('');
      setBackupCodes([]);
      
      const backupSection = document.getElementById('backupCodes');
      if (backupSection) {
        backupSection.classList.add('hidden');
      }
    }
  };

  return (
    <>
      {/* Status */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white mb-1">Status</h2>
            <p className="text-gray-400 text-sm">
              Two-factor authentication is currently{' '}
              <span className={isEnabled ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                {isEnabled ? 'enabled' : 'disabled'}
              </span>
            </p>
          </div>
          {isEnabled ? (
            <button
              onClick={handleDisable}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
            >
              Disable 2FA
            </button>
          ) : (
            <button
              onClick={handleEnableClick}
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all"
            >
              Enable 2FA
            </button>
          )}
        </div>
      </div>

      {/* Setup Steps */}
      {isEnabling && !isEnabled && (
        <div className="space-y-6">
          {/* Step 1 */}
          <div className="bg-gray-900/30 rounded-xl p-6 border border-gray-700">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">1</span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Download an Authenticator App</h3>
                <p className="text-gray-400 text-sm mb-4">
                  Choose an authenticator app to generate verification codes:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                    <h4 className="font-semibold text-white mb-1">Google Authenticator</h4>
                    <p className="text-gray-400 text-xs">iOS & Android</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                    <h4 className="font-semibold text-white mb-1">Microsoft Authenticator</h4>
                    <p className="text-gray-400 text-xs">iOS & Android</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                    <h4 className="font-semibold text-white mb-1">Authy</h4>
                    <p className="text-gray-400 text-xs">iOS & Android</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                    <h4 className="font-semibold text-white mb-1">1Password</h4>
                    <p className="text-gray-400 text-xs">iOS, Android & Desktop</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-gray-900/30 rounded-xl p-6 border border-gray-700">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">2</span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-4">Scan QR Code</h3>
                <div className="flex justify-center mb-4">
                  <div className="bg-white rounded-lg p-4">
                    <canvas ref={canvasRef} id="qrCode" className="block"></canvas>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mt-4 text-center">Or enter this code manually:</p>
                <code className="block bg-gray-900/50 px-4 py-3 rounded-lg text-green-400 font-mono text-sm mt-2 select-all text-center">
                  {formatSecret(secret)}
                </code>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-gray-900/30 rounded-xl p-6 border border-gray-700">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">3</span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Verify Code</h3>
                <p className="text-gray-400 text-sm mb-4">
                  Enter the 6-digit code from your authenticator app:
                </p>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="flex-1 bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none font-mono text-lg tracking-wider"
                    maxLength={6}
                  />
                  <button
                    onClick={handleVerifyCode}
                    disabled={verificationCode.length !== 6}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Verify & Enable
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backup Codes */}
      {backupCodes.length > 0 && (
        <div id="backupCodes" className="mt-6 bg-gradient-to-br from-amber-900/20 to-orange-900/20 border border-amber-700/50 rounded-xl p-6">
          <div className="flex gap-3 mb-4">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <div className="flex-1">
              <h3 className="text-amber-300 font-semibold mb-1">Backup Codes</h3>
              <p className="text-amber-200/80 text-sm mb-4">
                Save these backup codes in a secure place. Each can be used once if you lose access to your authenticator.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, index) => (
                  <code key={index} className="bg-gray-900/50 px-3 py-2 rounded text-sm font-mono text-gray-300">
                    {code}
                  </code>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
