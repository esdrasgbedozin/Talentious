'use client';

/**
 * ProfileSection Component - Talentious
 * Collapsible section for profile form
 */

import { ReactNode, useState } from 'react';

interface ProfileSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  isComplete?: boolean; // Visual indicator if section is filled
}

export default function ProfileSection({
  title,
  description,
  icon,
  children,
  defaultOpen = false,
  isComplete = false,
}: ProfileSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4">
          {/* Icon */}
          {icon && (
            <div className="w-10 h-10 bg-gradient-to-br from-[#38A169] to-[#2F855A] rounded-lg flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
          )}

          {/* Title and Description */}
          <div className="text-left">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              {/* Completion indicator */}
              {isComplete && (
                <div className="flex items-center gap-1.5 text-[#38A169] text-sm font-medium">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Complété</span>
                </div>
              )}
            </div>
            {description && (
              <p className="text-sm text-gray-500 mt-1">{description}</p>
            )}
          </div>
        </div>

        {/* Expand/Collapse Icon */}
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="px-6 py-6 border-t border-gray-200 bg-gray-50/50">
          {children}
        </div>
      )}
    </div>
  );
}
