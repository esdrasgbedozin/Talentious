import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import '@testing-library/jest-dom';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useSearchParams: () => ({ get: jest.fn() }),
  usePathname: () => '/login',
}));

// Mock auth lib
jest.mock('@/lib/auth', () => ({
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
  getMe: jest.fn(),
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

describe('Login Page', () => {
  it('should pass basic smoke test', () => {
    // Basic test to ensure Jest is working
    expect(true).toBe(true);
  });

  it('can render auth provider', () => {
    renderWithProviders(<div>Test</div>);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
