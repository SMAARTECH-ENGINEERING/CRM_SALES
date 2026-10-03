import SearchIcon from '@mui/icons-material/Search';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import DocumentList from '../components/documents/DocumentList.jsx';
import { SEARCH_DEBOUNCE_MS } from '../hooks/useListParams.js';

// /documents - every document the signed-in user may see, newest first.
// Documents are uploaded from the record they belong to.
export default function DocumentsPage() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h4" component="h1">
          Documents
        </Typography>
        <Typography color="text.secondary">
          Files attached to the records you can see. To add one, open the record and use its Documents tab.
        </Typography>
      </div>
      <TextField
        label="Search"
        placeholder="File name"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
        sx={{ maxWidth: 420 }}
      />
      <Card>
        <CardContent>
          {/* Keyed so a new search starts on page 1. */}
          <DocumentList key={search} search={search} />
        </CardContent>
      </Card>
    </Stack>
  );
}
