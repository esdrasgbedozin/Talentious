'use client';

/**
 * Password field with a show/hide toggle (eye icon). Wraps <Input> so labels,
 * errors and styles stay consistent. tabIndex=-1 on the toggle keeps the Tab
 * flow on form fields.
 */
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Input, { InputProps } from './Input';

export default function PasswordInput(
  props: Omit<InputProps, 'type' | 'rightIcon'>,
) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      rightIcon={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          className="flex items-center text-text-secondary transition-colors hover:text-primary focus:outline-none"
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      }
    />
  );
}
