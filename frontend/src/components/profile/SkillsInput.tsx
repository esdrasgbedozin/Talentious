'use client';

/**
 * SkillsInput Component - Talentious
 * Tag input for adding/removing skills
 */

import { useState, KeyboardEvent } from 'react';

interface SkillsInputProps {
  label?: string;
  skills: string[];
  onChange: (skills: string[]) => void;
  placeholder?: string;
  maxSkills?: number;
}

export default function SkillsInput({
  label,
  skills,
  onChange,
  placeholder = 'Tapez et appuyez sur Entrée',
  maxSkills = 20,
}: SkillsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      
      // Check if skill already exists
      if (skills.includes(inputValue.trim())) {
        setInputValue('');
        return;
      }

      // Check max limit
      if (skills.length >= maxSkills) {
        return;
      }

      // Add skill
      onChange([...skills, inputValue.trim()]);
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && skills.length > 0) {
      // Remove last skill if input is empty
      onChange(skills.slice(0, -1));
    }
  };

  const removeSkill = (index: number) => {
    onChange(skills.filter((_, i) => i !== index));
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {skills.length > 0 && (
            <span className="ml-2 text-gray-500 font-normal">
              ({skills.length}/{maxSkills})
            </span>
          )}
        </label>
      )}

      {/* Tags Display */}
      <div className="flex flex-wrap gap-2 mb-3">
        {skills.map((skill, index) => (
          <div
            key={index}
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-action to-action-hover text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm"
          >
            <span>{skill}</span>
            <button
              type="button"
              onClick={() => removeSkill(index)}
              className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
              aria-label={`Supprimer ${skill}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Input */}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={skills.length >= maxSkills}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed transition-all"
      />

      <p className="mt-2 text-xs text-gray-500">
        Tapez une compétence et appuyez sur <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Entrée</kbd>
      </p>
    </div>
  );
}
