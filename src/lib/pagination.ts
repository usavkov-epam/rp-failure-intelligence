export interface PageResult<T> {
  content: T[];
  page?: { number?: number; totalElements: number; totalPages: number };
}

export async function collectAllPages<T>(
  loadPage: (pageNumber: number) => Promise<PageResult<T>>,
  concurrency: number = PAGINATION.DEFAULT_CONCURRENCY,
): Promise<PageResult<T>> {
  const firstPage = await loadPage(PAGINATION.FIRST_PAGE);
  const totalPages = firstPage.page?.totalPages || PAGINATION.FIRST_PAGE;
  const content = [...firstPage.content];

  for (let pageNumber = PAGINATION.FIRST_PAGE + 1; pageNumber <= totalPages; pageNumber += concurrency) {
    const pageNumbers = Array.from(
      { length: Math.min(concurrency, totalPages - pageNumber + 1) },
      (_, index) => pageNumber + index,
    );
    const pages = await Promise.all(pageNumbers.map(loadPage));
    pages.forEach((page) => content.push(...page.content));
  }

  return { ...firstPage, content };
}
import { PAGINATION } from "./domain-constants";
