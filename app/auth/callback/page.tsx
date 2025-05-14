'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../utils/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        const { error } = await supabase.auth.getSession();
        if (error) throw error;
        
        // Redirect to home page after successful confirmation
        router.push('/');
      } catch (error) {
        console.error('Error during email confirmation:', error);
        // Redirect to login page if there's an error
        router.push('/auth/login?error=confirmation_failed');
      }
    };

    handleEmailConfirmation();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          Confirming your email...
        </h2>
        <p className="text-gray-600">
          Please wait while we confirm your email address.
        </p>
      </div>
    </div>
  );
} 