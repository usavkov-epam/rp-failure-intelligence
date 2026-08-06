export interface PageResult<T> {
  content: T[];
  page?: { number?: number; totalElements: number; totalPages: number };
}

export async function collectAllPages<T>(
  loadPage: (pageNumber: number) => Promise<PageResult<T>>,
  concurrency = 5,
): Promise<PageResult<T>> {
  const firstPage = await loadPage(1);
  const totalPages = firstPage.page?.totalPages || 1;
  const content = [...firstPage.content];

  for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += concurrency) {
    const pageNumbers = Array.from(
      { length: Math.min(concurrency, totalPages - pageNumber + 1) },
      (_, index) => pageNumber + index,
    );
    const pages = await Promise.all(pageNumbers.map(loadPage));
    pages.forEach((page) => content.push(...page.content));
  }

  return { ...firstPage, content };
}
