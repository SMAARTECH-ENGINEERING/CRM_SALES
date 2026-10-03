import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';

// One headline figure from the API: a label, the value, and an optional line
// underneath. With `to` the whole tile links to where the figure comes from.
export default function StatTile({ label, value, caption, to }) {
  const body = (
    <CardContent>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" component="p" sx={{ fontWeight: 600, my: 0.25 }} aria-label={label}>
        {value}
      </Typography>
      {/* Keeps tiles the same height whether or not there is a caption. */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', minHeight: '1.4em' }}>
        {caption}
      </Typography>
    </CardContent>
  );
  return (
    <Card>
      {to ? (
        <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }}>
          {body}
        </CardActionArea>
      ) : (
        body
      )}
    </Card>
  );
}
