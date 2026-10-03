import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { useTranslation } from 'react-i18next';

// What is shown while something loads. The skeleton has the shape of what is
// coming, so the page does not jump when it arrives:
//   page (default) - a header and a block of content
//   table          - rows
//   cards          - a row of tiles
//   detail         - a header, a side panel and a body
//   spinner        - for small areas (a dialog, a button's result)
export default function LoadingState({ variant = 'page', rows = 8, cards = 4, label }) {
  const { t } = useTranslation();
  const text = label ?? t('app.loading');
  const frame = (children) => (
    <Box role="status" aria-busy="true" aria-label={text}>
      {children}
    </Box>
  );

  if (variant === 'spinner') {
    return frame(
      <Box sx={{ minHeight: 160, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  const table = (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.25}>
        <Skeleton variant="rounded" height={28} />
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} variant="text" height={26} />
        ))}
      </Stack>
    </Paper>
  );
  const tiles = (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: `repeat(${cards}, 1fr)` } }}>
      {Array.from({ length: cards }, (_, index) => (
        <Skeleton key={index} variant="rounded" height={96} />
      ))}
    </Box>
  );
  const header = (
    <Stack spacing={0.5}>
      <Skeleton variant="text" width={220} height={34} />
      <Skeleton variant="text" width={320} height={20} />
    </Stack>
  );

  if (variant === 'table') return frame(table);
  if (variant === 'cards') return frame(tiles);
  if (variant === 'detail') {
    return frame(
      <Stack spacing={2}>
        {header}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '320px 1fr' } }}>
          <Skeleton variant="rounded" height={280} />
          <Skeleton variant="rounded" height={280} />
        </Box>
      </Stack>
    );
  }
  return frame(
    <Stack spacing={2}>
      {header}
      {table}
    </Stack>
  );
}
