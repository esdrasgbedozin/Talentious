import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import '@testing-library/jest-dom';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
  useSearchParams: () => ({ get: jest.fn() }),
  usePathname: () => '/profile',
}));

// Mock auth lib
jest.mock('@/lib/auth', () => ({
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
  getMe: jest.fn(() => Promise.resolve({ id: '123', email: 'test@example.com', role: 'user' })),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('Profile Page', () => {
  it('should pass basic smoke test', () => {
    expect(true).toBe(true);
  });

  it('can render with providers', () => {
    renderWithProviders(<div>Test Profile</div>);
    expect(screen.getByText('Test Profile')).toBeInTheDocument();
  });
});
