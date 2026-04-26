import { useState, useCallback } from 'react';

interface ChangePasswordResponse {
  message: string;
}

export const usePasswordRotation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('accessToken');
        if (!token) {
          throw new Error('No access token found');
        }

        const response = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to change password');
        }

        const data: ChangePasswordResponse = await response.json();
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { changePassword, isLoading, error };
};
