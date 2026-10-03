import SearchIcon from '@mui/icons-material/Search';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useNavigation from '../../hooks/useNavigation.js';
import { SEARCH_MIN_LENGTH, useGlobalSearch } from '../../hooks/useSearch.js';
import useShortcuts, { keyLabel } from '../../hooks/useShortcuts.js';
import { entityPath } from '../../utils/entityPaths.js';

const GO_TO = '__goto';
const CREATE = '__create';

// The search box in the top bar, which is also the command palette.
//
//  - Records: whatever is typed is looked up by the API in every kind of record
//    the user may see, and shown grouped by kind.
//  - Commands: the pages the user may open and the records they may create,
//    matched as they type - and listed in full when the box is empty.
//
// Choosing an entry opens it: with the mouse, or the arrow keys and Enter.
// Ctrl+K (⌘K) puts the cursor in the box from anywhere.
export default function GlobalSearch({ sx }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const input = useRef(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const { results, error, pending } = useGlobalSearch(text);
  const { items, createItems } = useNavigation();
  useShortcuts({ search: () => input.current?.focus() });

  const typed = text.trim().toLowerCase();
  const ready = typed.length >= SEARCH_MIN_LENGTH;

  // What the user may open or create, by its name in their language.
  const commands = useMemo(
    () => [
      ...items.map((item) => ({ id: item.id, type: 'command', category: GO_TO, title: t(item.labelKey), to: item.to, icon: item.icon })),
      ...createItems.map((item) => ({ id: item.id, type: 'create', category: CREATE, title: t(item.commandKey), to: item.to, icon: item.icon })),
    ],
    [items, createItems, t]
  );

  const options = useMemo(() => {
    const matching = typed ? commands.filter((command) => command.title.toLowerCase().includes(typed)) : commands;
    // One flat list, in the API's order; only records that have a page.
    const records = ready
      ? Object.entries(results ?? {}).flatMap(([category, list]) => list.filter((item) => entityPath(item.type, item.id)).map((item) => ({ ...item, category })))
      : [];
    return [...records, ...matching];
  }, [commands, typed, ready, results]);

  function choose(option) {
    if (!option) return;
    setText('');
    setOpen(false);
    input.current?.blur();
    navigate(option.to ?? entityPath(option.type, option.id));
  }

  const heading = (category) => {
    if (category === GO_TO) return t('search.commands');
    if (category === CREATE) return t('search.create');
    // A category without a name of its own is shown under its key.
    return t(`search.categories.${category}`, { defaultValue: category });
  };

  return (
    <Autocomplete
      size="small"
      sx={{ flex: 1, minWidth: 0, maxWidth: 560, ...sx }}
      options={options}
      // The API has done the matching of records; commands are matched above.
      filterOptions={(all) => all}
      groupBy={(option) => heading(option.category)}
      getOptionLabel={(option) => option.title ?? ''}
      getOptionKey={(option) => `${option.type}-${option.id}`}
      isOptionEqualToValue={(option, value) => option.id === value.id && option.type === value.type}
      value={null}
      onChange={(event, option) => choose(option)}
      inputValue={text}
      onInputChange={(event, value, reason) => {
        // Choosing a result must not leave its title in the box.
        if (reason !== 'reset') setText(value);
      }}
      open={open && (options.length > 0 || ready)}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      openOnFocus
      loading={pending && options.length === 0}
      loadingText={t('search.searching')}
      noOptionsText={error ? error.message : t('search.nothing')}
      forcePopupIcon={false}
      clearOnBlur={false}
      blurOnSelect
      slotProps={{ paper: { sx: { minWidth: 320 } }, listbox: { sx: { maxHeight: '70vh' } } }}
      renderOption={({ key, ...props }, option) => {
        const Icon = option.icon;
        return (
          <Box component="li" key={key} {...props} sx={{ display: 'flex !important', alignItems: 'center', gap: 1.5 }}>
            {Icon && <Icon fontSize="small" color="action" />}
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body1" noWrap>
                {option.title}
              </Typography>
              {option.subtitle && (
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {option.subtitle}
                </Typography>
              )}
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={input}
          placeholder={t('search.placeholderLong')}
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps?.htmlInput, 'aria-label': t('search.label'), 'aria-keyshortcuts': 'Control+K Meta+K' },
            input: {
              ...params.slotProps?.input,
              sx: { bgcolor: 'surface.subtle' },
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end" sx={{ display: { xs: 'none', md: 'flex' } }}>
                  <Typography variant="caption" color="text.secondary" aria-hidden sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 0.75, whiteSpace: 'nowrap' }}>
                    {keyLabel('Mod')} K
                  </Typography>
                </InputAdornment>
              ),
            },
          }}
        />
      )}
    />
  );
}
