import { act, renderHook, waitFor } from '@testing-library/react';
import { triggerBrowserDownload, useCvExport } from '@/hooks/useCvExport';
import { exportCvPdf, type ExportedFile } from '@/lib/cvExport';

jest.mock('@/lib/cvExport', () => ({
  // On garde les fonctions PURES réelles (toSafePdfFilename…) et on ne simule
  // que l'orchestration réseau.
  ...jest.requireActual('@/lib/cvExport'),
  exportCvPdf: jest.fn(),
}));

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  showToast: jest.fn(),
};
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => mockToast,
}));

const exportCvPdfMock = exportCvPdf as jest.MockedFunction<typeof exportCvPdf>;

beforeEach(() => {
  jest.clearAllMocks();
  // jsdom n'implémente pas l'API Object URL ni la navigation : on les stube.
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

describe('triggerBrowserDownload', () => {
  it("crée une ancre download, clique, puis révoque l'URL en différé", () => {
    jest.useFakeTimers();
    const realCreate = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') anchors.push(el as HTMLAnchorElement);
      return el;
    });
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    triggerBrowserDownload({ blob, filename: 'mon-cv.pdf' });

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchors[0]?.download).toBe('mon-cv.pdf');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // Révocation différée (pas dans le tick du clic).
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_000);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    jest.restoreAllMocks();
    jest.useRealTimers();
  });
});

describe('useCvExport', () => {
  it('succès : passe par « en cours », déclenche le téléchargement puis notifie', async () => {
    const file: ExportedFile = {
      blob: new Blob(['%PDF'], { type: 'application/pdf' }),
      filename: 'mon-cv.pdf',
    };
    let resolveExport: (f: ExportedFile) => void = () => {};
    exportCvPdfMock.mockReturnValue(
      new Promise<ExportedFile>((resolve) => {
        resolveExport = resolve;
      }),
    );

    const { result } = renderHook(() => useCvExport());
    expect(result.current.isExporting).toBe(false);

    act(() => {
      void result.current.exportPdf('cv-1');
    });

    await waitFor(() => expect(result.current.isExporting).toBe(true));
    expect(result.current.exportingId).toBe('cv-1');

    await act(async () => {
      resolveExport(file);
    });

    await waitFor(() => expect(result.current.isExporting).toBe(false));
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(file.blob);
    expect(mockToast.success).toHaveBeenCalledTimes(1);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('nomme le fichier téléchargé d’après le nom du CV passé', async () => {
    const realCreate = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') anchors.push(el as HTMLAnchorElement);
      return el;
    });
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    exportCvPdfMock.mockResolvedValue({
      blob: new Blob(['%PDF'], { type: 'application/pdf' }),
      filename: 'cv.pdf', // nom serveur générique — doit être ignoré
    });

    const { result } = renderHook(() => useCvExport());
    await act(async () => {
      await result.current.exportPdf('cv-1', 'CV - Dev React - Google');
    });

    expect(anchors[0]?.download).toBe('CV - Dev React - Google.pdf');
    jest.restoreAllMocks();
  });

  it('échec : traduit une vraie erreur axios 409 via le mapper et notifie', async () => {
    exportCvPdfMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { type: 'https://talentious.fr/errors/job-in-progress' },
      },
    });

    const { result } = renderHook(() => useCvExport());
    await act(async () => {
      await result.current.exportPdf('cv-1');
    });

    expect(mockToast.error).toHaveBeenCalledWith(
      "Un export de ce CV est déjà en cours. Patiente un instant avant d'en relancer un.",
    );
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it("402 : laisse l'intercepteur rediriger, pas de toast d'erreur", async () => {
    exportCvPdfMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 402, data: {} },
    });

    const { result } = renderHook(() => useCvExport());
    await act(async () => {
      await result.current.exportPdf('cv-1');
    });

    expect(mockToast.error).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it("ignore un second clic tant qu'un export est en cours, puis revient à idle", async () => {
    let resolveExport: (f: ExportedFile) => void = () => {};
    exportCvPdfMock.mockReturnValue(
      new Promise<ExportedFile>((resolve) => {
        resolveExport = resolve;
      }),
    );

    const { result } = renderHook(() => useCvExport());
    act(() => {
      void result.current.exportPdf('cv-1');
    });
    await waitFor(() => expect(result.current.isExporting).toBe(true));

    act(() => {
      void result.current.exportPdf('cv-2');
    });
    expect(exportCvPdfMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveExport({ blob: new Blob(['x']), filename: 'cv.pdf' });
    });
    await waitFor(() => expect(result.current.isExporting).toBe(false));
  });

  it('démontage : annule le flux et ne notifie pas (pas de setState post-démontage)', async () => {
    let rejectExport: (e: unknown) => void = () => {};
    exportCvPdfMock.mockReturnValue(
      new Promise<ExportedFile>((_resolve, reject) => {
        rejectExport = reject;
      }),
    );

    const { result, unmount } = renderHook(() => useCvExport());
    act(() => {
      void result.current.exportPdf('cv-1');
    });
    await waitFor(() => expect(result.current.isExporting).toBe(true));

    unmount(); // abort du controller

    await act(async () => {
      rejectExport(new DOMException('Aborted', 'AbortError'));
    });

    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});
