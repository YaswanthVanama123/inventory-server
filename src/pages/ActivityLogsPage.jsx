import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  TextField,
  MenuItem,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
  Collapse,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  KeyboardArrowDown as ExpandMoreIcon,
  KeyboardArrowUp as ExpandLessIcon,
  CheckCircle as SuccessIcon,
  Cancel as FailIcon,
  Person as PersonIcon,
  Computer as DeviceIcon,
  CalendarToday as DateIcon,
  Speed as SpeedIcon,
  Timeline as TimelineIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../services/api';

const ActivityLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalLogs, setTotalLogs] = useState(0);
  const [expandedRow, setExpandedRow] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    resource: '',
    action: '',
    device: '',
    success: '',
    search: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [page, rowsPerPage, filters]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {
        page: page + 1,
        limit: rowsPerPage,
        ...filters
      };

      const response = await api.get('/activity-logs', { params });

      if (response.data.success) {
        setLogs(response.data.data.logs);
        setTotalLogs(response.data.data.pagination.total);
      }
    } catch (error) {
      console.error('Failed to fetch activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/activity-logs/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPage(0);
  };

  const handleReset = () => {
    setFilters({
      resource: '',
      action: '',
      device: '',
      success: '',
      search: '',
      startDate: '',
      endDate: ''
    });
    setPage(0);
  };

  const handleExport = async (format = 'json') => {
    try {
      const params = { ...filters, format };
      const response = await api.get('/activity-logs/export', {
        params,
        responseType: format === 'csv' ? 'blob' : 'json'
      });

      const blob = new Blob(
        [format === 'csv' ? response.data : JSON.stringify(response.data, null, 2)],
        { type: format === 'csv' ? 'text/csv' : 'application/json' }
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `activity-logs-${Date.now()}.${format}`;
      link.click();
    } catch (error) {
      console.error('Failed to export logs:', error);
    }
  };

  const getActionColor = (action) => {
    const colors = {
      CREATE: 'success',
      UPDATE: 'info',
      DELETE: 'error',
      VIEW: 'default',
      LOGIN: 'primary',
      LOGOUT: 'secondary',
      SYNC: 'warning',
      VERIFY: 'success',
      APPROVE: 'success',
      REJECT: 'error',
      CANCEL: 'error'
    };
    return colors[action] || 'default';
  };

  const getDeviceIcon = (device) => {
    switch (device) {
      case 'mobile':
        return '📱';
      case 'tablet':
        return '📱';
      case 'desktop':
        return '💻';
      case 'web':
        return '🌐';
      default:
        return '❓';
    }
  };

  const formatTimestamp = (timestamp) => {
    try {
      return format(new Date(timestamp), 'MMM dd, yyyy HH:mm:ss');
    } catch {
      return 'Invalid date';
    }
  };

  const renderDetailsDialog = () => (
    <Dialog
      open={detailDialogOpen}
      onClose={() => setDetailDialogOpen(false)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>Activity Log Details</DialogTitle>
      <DialogContent>
        {selectedLog && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">User</Typography>
                <Typography variant="body1">{selectedLog.performedByName || 'Unknown'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Email</Typography>
                <Typography variant="body1">{selectedLog.performedByEmail || 'N/A'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Action</Typography>
                <Chip
                  label={selectedLog.action}
                  color={getActionColor(selectedLog.action)}
                  size="small"
                />
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Resource</Typography>
                <Typography variant="body1">{selectedLog.resource}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Device</Typography>
                <Typography variant="body1">
                  {getDeviceIcon(selectedLog.device)} {selectedLog.device}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Browser</Typography>
                <Typography variant="body1">{selectedLog.browser || 'Unknown'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">IP Address</Typography>
                <Typography variant="body1">{selectedLog.ipAddress || 'Unknown'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Duration</Typography>
                <Typography variant="body1">{selectedLog.duration || 0} ms</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Endpoint</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'grey.100', p: 1, borderRadius: 1 }}>
                  {selectedLog.method} {selectedLog.endpoint}
                </Typography>
              </Grid>
              {selectedLog.details && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Details</Typography>
                  <Paper elevation={0} sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, maxHeight: 300, overflow: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: '12px' }}>
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  </Paper>
                </Grid>
              )}
            </Grid>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
        Activity Logs
      </Typography>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: 'primary.main' }}>
                    <TimelineIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h4">{stats.totalLogs.toLocaleString()}</Typography>
                    <Typography variant="body2" color="text.secondary">Total Activities</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: 'success.main' }}>
                    <SuccessIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h4">{stats.successfulActions.toLocaleString()}</Typography>
                    <Typography variant="body2" color="text.secondary">Successful</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: 'error.main' }}>
                    <FailIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h4">{stats.failedActions.toLocaleString()}</Typography>
                    <Typography variant="body2" color="text.secondary">Failed</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: 'info.main' }}>
                    <SpeedIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h4">{stats.successRate}%</Typography>
                    <Typography variant="body2" color="text.secondary">Success Rate</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Search"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="User, email, endpoint..."
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                select
                size="small"
                label="Resource"
                value={filters.resource}
                onChange={(e) => handleFilterChange('resource', e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="USER">User</MenuItem>
                <MenuItem value="INVENTORY">Inventory</MenuItem>
                <MenuItem value="INVOICE">Invoice</MenuItem>
                <MenuItem value="ORDER">Order</MenuItem>
                <MenuItem value="STOCK">Stock</MenuItem>
                <MenuItem value="AUTH">Auth</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                select
                size="small"
                label="Action"
                value={filters.action}
                onChange={(e) => handleFilterChange('action', e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="CREATE">Create</MenuItem>
                <MenuItem value="UPDATE">Update</MenuItem>
                <MenuItem value="DELETE">Delete</MenuItem>
                <MenuItem value="VIEW">View</MenuItem>
                <MenuItem value="LOGIN">Login</MenuItem>
                <MenuItem value="SYNC">Sync</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                select
                size="small"
                label="Device"
                value={filters.device}
                onChange={(e) => handleFilterChange('device', e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="web">Web</MenuItem>
                <MenuItem value="mobile">Mobile</MenuItem>
                <MenuItem value="desktop">Desktop</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={1.5}>
              <TextField
                fullWidth
                select
                size="small"
                label="Status"
                value={filters.success}
                onChange={(e) => handleFilterChange('success', e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="true">Success</MenuItem>
                <MenuItem value="false">Failed</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={1.5}>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleReset}
                  fullWidth
                >
                  Reset
                </Button>
                <IconButton onClick={fetchLogs} color="primary">
                  <RefreshIcon />
                </IconButton>
                <IconButton onClick={() => handleExport('csv')} color="primary">
                  <DownloadIcon />
                </IconButton>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width="50px"></TableCell>
                <TableCell>Timestamp</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>Device</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Duration</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Alert severity="info">No activity logs found</Alert>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <React.Fragment key={log._id}>
                    <TableRow hover>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => setExpandedRow(expandedRow === log._id ? null : log._id)}
                        >
                          {expandedRow === log._id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatTimestamp(log.timestamp)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Avatar sx={{ width: 32, height: 32, fontSize: '14px' }}>
                            {(log.performedByName || 'U')[0]}
                          </Avatar>
                          <Box>
                            <Typography variant="body2">{log.performedByName || 'Unknown'}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {log.performedByEmail}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={log.action}
                          color={getActionColor(log.action)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{log.resource}</Typography>
                        {log.resourceName && (
                          <Typography variant="caption" color="text.secondary">
                            {log.resourceName}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Tooltip title={log.browser || 'Unknown'}>
                          <span>{getDeviceIcon(log.device)} {log.device}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {log.success ? (
                          <Chip
                            icon={<SuccessIcon />}
                            label="Success"
                            color="success"
                            size="small"
                            variant="outlined"
                          />
                        ) : (
                          <Chip
                            icon={<FailIcon />}
                            label="Failed"
                            color="error"
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{log.duration || 0} ms</Typography>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                        <Collapse in={expandedRow === log._id} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
                            <Grid container spacing={2}>
                              <Grid item xs={12} md={6}>
                                <Typography variant="caption" color="text.secondary">Endpoint</Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                  {log.method} {log.endpoint}
                                </Typography>
                              </Grid>
                              <Grid item xs={12} md={3}>
                                <Typography variant="caption" color="text.secondary">IP Address</Typography>
                                <Typography variant="body2">{log.ipAddress || 'Unknown'}</Typography>
                              </Grid>
                              <Grid item xs={12} md={3}>
                                <Typography variant="caption" color="text.secondary">Status Code</Typography>
                                <Typography variant="body2">{log.statusCode}</Typography>
                              </Grid>
                              {log.details && (
                                <Grid item xs={12}>
                                  <Button
                                    size="small"
                                    onClick={() => {
                                      setSelectedLog(log);
                                      setDetailDialogOpen(true);
                                    }}
                                  >
                                    View Full Details
                                  </Button>
                                </Grid>
                              )}
                            </Grid>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={totalLogs}
          page={page}
          onPageChange={(e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Card>

      {renderDetailsDialog()}
    </Box>
  );
};

export default ActivityLogsPage;
