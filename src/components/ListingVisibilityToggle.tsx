import React, { useState } from 'react';

interface ListingVisibilityToggleProps {
  listingId: string;
  initialIsActive: boolean;
  mentorId: string;
  onToggleSuccess?: (newState: boolean) => void;
  onToggleError?: (error: string) => void;
}

export const ListingVisibilityToggle: React.FC<ListingVisibilityToggleProps> = ({
  listingId,
  initialIsActive,
  mentorId,
  onToggleSuccess,
  onToggleError
}) => {
  const [isActive, setIsActive] = useState(initialIsActive);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    setIsLoading(true);
    const previousState = isActive;
    const newState = !isActive;
    try {
      // Assuming authorization token is passed via headers elsewhere or credentials
      const response = await fetch(`/api/listings/${listingId}/visibility`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          // Usually handled by interceptors, providing Authorization here is project-defined
        },
        body: JSON.stringify({ isActive: newState, mentorId }), 
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to toggle visibility');
      }

      setIsActive(newState);
      if (onToggleSuccess) {
        onToggleSuccess(newState);
      }
    } catch (error: any) {
      setIsActive(previousState);
      if (onToggleError) {
        onToggleError(error.message);
      } else {
        alert(`Error toggling visibility: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center space-x-3">
      <span className="text-sm font-medium text-gray-700">
        Visibility: {isActive ? 'Active' : 'Inactive'}
      </span>
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
          isActive ? 'bg-indigo-600' : 'bg-gray-200'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        role="switch"
        aria-checked={isActive}
      >
        <span className="sr-only">Toggle Listing Visibility</span>
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            isActive ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};
