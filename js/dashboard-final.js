$(document).ready(function() {
    // Check authentication first
    if (!checkAuthentication()) {
        return; // Authentication failed, redirect will happen
    }

    // Load dashboard components
    loadCurrencies();
    initializeDatePicker();
    loadUserInfo();
    loadRequests();

    // Set up event listeners
    setupEventListeners();

    // Initialize date input state based on default selection
    initializeDateInputState();

    // Initialize auto-refresh
    initializeAutoRefresh();
});

// Currency codes (ISO 4217)
const currencies = [
    { code: 'USD', name: 'US Dollar' },
    { code: 'EUR', name: 'Euro' },
    { code: 'GBP', name: 'British Pound' },
    { code: 'JPY', name: 'Japanese Yen' },
    { code: 'AUD', name: 'Australian Dollar' },
    { code: 'CAD', name: 'Canadian Dollar' },
    { code: 'CHF', name: 'Swiss Franc' },
    { code: 'CNY', name: 'Chinese Yuan' },
    { code: 'SEK', name: 'Swedish Krona' },
    { code: 'NZD', name: 'New Zealand Dollar' },
    { code: 'MXN', name: 'Mexican Peso' },
    { code: 'SGD', name: 'Singapore Dollar' },
    { code: 'HKD', name: 'Hong Kong Dollar' },
    { code: 'NOK', name: 'Norwegian Krone' },
    { code: 'TRY', name: 'Turkish Lira' },
    { code: 'RUB', name: 'Russian Ruble' },
    { code: 'INR', name: 'Indian Rupee' },
    { code: 'BRL', name: 'Brazilian Real' },
    { code: 'ZAR', name: 'South African Rand' },
    { code: 'KRW', name: 'South Korean Won' }
];

// API base URL
const API_BASE_URL = '/api';

// Global variables for trends
let currentTrendsPeriod = 'monthly';

// Application data
let requests = [];
let filteredRequests = [];
let currentUser = null;
let userInfo = {
    userName: '',
    userEmail: '',
    userTeam: '',
    description: ''
};

// Pagination variables
let currentPage = 1;
let itemsPerPage = 10;
let totalPages = 1;

// Auto-refresh state
let autoRefreshEnabled = true;
let autoRefreshCountdown = 30;
let autoRefreshTimer = null;
let countdownTimer = null;

// ==================== SESSION MANAGEMENT ====================

// Check authentication on page load
function checkAuthentication() {
    const userSession = localStorage.getItem('userSession');

    if (!userSession) {
        // No session found, redirect to login
        window.location.href = '/login.html';
        return false;
    }

    try {
        currentUser = JSON.parse(userSession);

        // Update UI with user info
        $('#current-user').text(currentUser.username);

        // Initialize admin access based on user role
        if (currentUser.isAdmin) {
            $('#admin-tab-item').show();
            $('#user-management-tab-item').show();
            $('#request-override-tab-item').show();
        } else {
            $('#admin-tab-item').hide();
            $('#user-management-tab-item').hide();
            $('#request-override-tab-item').hide();
        }

        return true;
    } catch (e) {
        console.error('Invalid session data:', e);
        localStorage.removeItem('userSession');
        window.location.href = '/login.html';
        return false;
    }
}

// Logout function
function logout() {
    localStorage.removeItem('userSession');
    localStorage.removeItem('currentUser');

    // Optional: Call logout API
    fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST'
    }).finally(() => {
        window.location.href = '/login.html';
    });
}

function initializeDashboard() {
    // This function is no longer needed - session handled by checkAuthentication()
}

function loadCurrencies() {
    const currencySelect = $('#currency');
    currencySelect.empty();
    currencySelect.append('<option value="">Select Currency</option>');

    currencies.forEach(currency => {
        currencySelect.append(`<option value="${currency.code}">${currency.code} - ${currency.name}</option>`);
    });
}

function initializeDatePicker() {
    // Initialize flatpickr with full calendar (no minDate restriction)
    window.flatpickrInstance = flatpickr("#requestDates", {
        mode: "multiple",
        dateFormat: "Y-m-d",
        placeholder: "Select multiple dates",
        allowInput: true,
        enableTime: false,
        // Allow historical dates - no minDate restriction
        // minDate: "today" // Removed to allow historical dates
    });
}

function setupEventListeners() {
    // New Request Form Submission
    $('#newRequestForm').on('submit', function(e) {
        e.preventDefault();
        submitNewRequest();
    });

    // User Info Form Submission
    $('#userInfoForm').on('submit', function(e) {
        e.preventDefault();
        saveUserInfo();
    });

    // Date input type toggle
    $('input[name="dateInputType"]').on('change', function() {
        const selectedType = $(this).val();
        if (selectedType === 'calendar') {
            $('#requestDates').show().prop('required', true);
            $('#dateRangeContainer').hide();
            // Remove required from hidden range inputs
            $('#dateRangeContainer .range-start, #dateRangeContainer .range-end').prop('required', false);
        } else if (selectedType === 'range') {
            $('#requestDates').hide().prop('required', false);
            $('#dateRangeContainer').show();
            // Add required back to visible range inputs
            $('#dateRangeContainer .range-start, #dateRangeContainer .range-end').prop('required', true);
            // Initialize with one date range if empty
            if ($('#dateRangesList').children().length === 0) {
                addDateRange();
            }
        }
    });

    // Add date range button
    $('#addDateRangeBtn').on('click', function() {
        addDateRange();
    });

    // Handle date range removal (delegated event)
    $(document).on('click', '.btn-remove-range', function() {
        $(this).closest('.date-range-item').remove();
        updateDateRangesPreview();
    });

    // Form Reset
    $('#newRequestForm').on('reset', function() {
        setTimeout(() => {
            $('#requestDates').val('');
            $('#dateRangesList').empty();
            if (window.flatpickrInstance) {
                window.flatpickrInstance.clear();
            }
            // Reset to calendar option
            $('#calendarOption').prop('checked', true).parent().addClass('active');
            $('#rangeOption').prop('checked', false).parent().removeClass('active');
            $('#requestDates').show().prop('required', true);
            $('#dateRangeContainer').hide();
        }, 100);
    });

    // Tab switching events
    $('a[data-toggle="tab"]').on('shown.bs.tab', function(e) {
        const target = $(e.target).attr('href');
        if (target === '#dashboard') {
            loadRequests();
        } else if (target === '#user-info') {
            loadUserInfo();
        }
    });

    // Auto-populate requester details from user info
    $('#new-request-tab').on('click', function() {
        setTimeout(() => {
            if (userInfo.userFullName) {
                $('#requestorName').val(userInfo.userFullName);
            }
            if (userInfo.userEmail) {
                $('#requestorEmail').val(userInfo.userEmail);
            }
            if (userInfo.userTeam) {
                $('#teamName').val(userInfo.userTeam);
            }
        }, 100);
    });

    // Search functionality
    $('#searchRequests').on('input', function() {
        filterRequests();
    });

    // Status filter functionality
    $('#statusFilter').on('change', function() {
        filterRequests();
    });

    // Date filter functionality
    $('#dateFilter').on('change', function() {
        filterRequests();
    });

    // Character counter for description in New Request form
    $('#description').on('input', function() {
        const currentLength = $(this).val().length;
        $('#descriptionCount').text(currentLength);

        if (currentLength > 450) {
            $('#descriptionCount').addClass('text-warning').removeClass('text-danger');
        } else if (currentLength > 480) {
            $('#descriptionCount').addClass('text-danger').removeClass('text-warning');
        } else {
            $('#descriptionCount').removeClass('text-warning text-danger');
        }
    });

    // Character counter for description in User Info form
    $('#userDescription').on('input', function() {
        const currentLength = $(this).val().length;
        $('#userDescriptionCount').text(currentLength);

        if (currentLength > 250) {
            $('#userDescriptionCount').addClass('text-warning').removeClass('text-danger');
        } else if (currentLength > 280) {
            $('#userDescriptionCount').addClass('text-danger').removeClass('text-warning');
        } else {
            $('#userDescriptionCount').removeClass('text-warning text-danger');
        }
    });

    // Enhanced form validation
    $('.form-control[required]').on('blur input', function() {
        validateField($(this));
    });

    // Email validation
    $('input[type="email"]').on('blur input', function() {
        validateEmailField($(this));
    });

    // Number validation
    $('input[type="number"]').on('blur input', function() {
        validateNumberField($(this));
    });

    // Currency search functionality
    $('#currency').select2 ? $('#currency').select2({
        placeholder: 'Select or search currency',
        allowClear: true
    }) : null;

    // Setup pagination event listeners
    setupPaginationEventListeners();
}

function generateRequestId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const prefix = 'REQ';
    return `${prefix}${timestamp}${random}`;
}

function parseDataRanges(rangeInput) {
    if (!rangeInput) return '';

    const ranges = rangeInput.split(',').map(range => range.trim());
    const allDates = [];

    ranges.forEach(range => {
        if (range.includes(':')) {
            const [startDate, endDate] = range.split(':').map(date => date.trim());

            // Validate date format (YYYY-MM-DD)
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
                console.warn(`Invalid date format in range: ${range}`);
                return;
            }

            const start = new Date(startDate);
            const end = new Date(endDate);

            if (start > end) {
                console.warn(`Start date is after end date in range: ${range}`);
                return;
            }

            // Generate all dates between start and end (inclusive)
            const currentDate = new Date(start);
            while (currentDate <= end) {
                allDates.push(currentDate.toISOString().split('T')[0]);
                currentDate.setDate(currentDate.getDate() + 1);
            }
        } else {
            // Single date
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (dateRegex.test(range)) {
                allDates.push(range);
            } else {
                console.warn(`Invalid date format: ${range}`);
            }
        }
    });

    return allDates.join(',');
}

function submitNewRequest() {
    // Validate form before submission
    const $form = $('#newRequestForm');
    if (!validateForm($form)) {
        showErrorMessage('Validation Error', 'Please correct the highlighted fields before submitting.');
        return;
    }

    showLoadingSpinner();

    // Get date input based on selected type
    const dateInputType = $('input[name="dateInputType"]:checked').val();
    let requestDates = '';

    if (dateInputType === 'calendar') {
        requestDates = $('#requestDates').val();
    } else if (dateInputType === 'range') {
        requestDates = collectDateRanges();
    }

    // Get form data
    const formData = {
        requestorName: $('#requestorName').val().trim(),
        requestorEmail: $('#requestorEmail').val().trim(),
        ccEmail: $('#ccEmail').val().trim(),
        teamName: $('#teamName').val().trim(),
        categoryName: $('#categoryName').val(),
        requestDates: requestDates,
        acctNumber: $('#acctNumber').val().trim(),
        requestName: $('#requestName').val().trim(),
        currency: $('#currency').val(),
        amount: parseFloat($('#amount').val()),
        adjustment: $('#adjustment').val(),
        description: $('#description').val().trim(),
        userId: currentUser ? currentUser.id : null
    };

    // Submit to API
    fetch(`${API_BASE_URL}/requests`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        hideLoadingSpinner();

        if (data.success) {
            showSuccessMessage('Request Submitted Successfully!', `Your request has been submitted with ID: ${data.requestId}`);

            // Clear form
            $('#newRequestForm')[0].reset();
            $('#requestDates').val('');
            $('#dateRangesList').empty();
            if (window.flatpickrInstance) {
                window.flatpickrInstance.clear();
            }
            // Reset to calendar option
            $('#calendarOption').prop('checked', true).parent().addClass('active');
            $('#rangeOption').prop('checked', false).parent().removeClass('active');
            $('#requestDates').show().prop('required', true);
            $('#dateRangeContainer').hide();

            // Switch to dashboard tab and load requests
            $('#dashboard-tab').tab('show');
            setTimeout(() => {
                loadRequests();
            }, 500);
        } else {
            showErrorMessage('Submission Failed', data.error || 'Failed to submit request');
        }
    })
    .catch(error => {
        hideLoadingSpinner();
        console.error('Error submitting request:', error);
        showErrorMessage('Submission Failed', 'An error occurred while submitting the request');
    });
}

function saveUserInfo() {
    // Validate form before submission
    const $form = $('#userInfoForm');
    if (!validateForm($form)) {
        showErrorMessage('Validation Error', 'Please correct the highlighted fields before saving.');
        return;
    }

    // Only send the description as that's the only editable field
    const userData = {
        username: currentUser.username,
        description: $('#userDescription').val().trim()
    };

    // Save via API using the new PUT endpoint
    fetch(`${API_BASE_URL}/users/profile`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update the local userInfo object
            userInfo.description = userData.description;

            // Update current user session data
            if (currentUser) {
                currentUser.description = userData.description;
                localStorage.setItem('userSession', JSON.stringify(currentUser));
            }

            showSuccessMessage('User Information Saved!', 'Your user description has been updated successfully.');
        } else {
            showErrorMessage('Save Failed', data.error || 'Failed to save user information');
        }
    })
    .catch(error => {
        console.error('Error saving user info:', error);
        showErrorMessage('Save Failed', 'An error occurred while saving user information');
    });
}

function loadUserInfo() {
    if (currentUser) {
        userInfo = {
            userName: currentUser.username || '',
            userEmail: currentUser.email || '',
            userTeam: currentUser.team || '',
            userFullName: currentUser.name || '',
            description: currentUser.description || ''
        };

        $('#userFullName').val(userInfo.userFullName);
        $('#userName').val(userInfo.userName);
        $('#userEmail').val(userInfo.userEmail);
        $('#userTeam').val(userInfo.userTeam);
        $('#userDescription').val(userInfo.description);

        // Update character count for user description
        $('#userDescriptionCount').text(userInfo.description ? userInfo.description.length : 0);

        // Update current user display
        $('#current-user').text(userInfo.userFullName || userInfo.userName);
    }
}

function loadRequests() {
    if (!currentUser) {
        console.error('No user session found');
        window.location.href = '/login.html';
        return Promise.reject('No user session');
    }

    // Add timestamp to prevent caching and user parameters
    const timestamp = new Date().getTime();
    const params = new URLSearchParams({
        _t: timestamp,
        username: currentUser.username,
        isAdmin: currentUser.isAdmin || false
    });

    return fetch(`${API_BASE_URL}/requests?${params}`, {
        cache: 'no-cache',
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Requests loaded successfully:', data);
        if (data.success) {
            requests = data.data || [];
            filteredRequests = []; // Reset filtered requests to show all data
            updateStatistics();
            renderRequestsTable();
        } else {
            console.error('API returned error:', data);
            showErrorMessage('Load Failed', data.error || 'Failed to load requests');
        }
    })
    .catch(error => {
        console.error('Error loading requests:', error);
        console.error('Error details:', error.message, error.stack);

        // Check if requests array has data, if so, keep it and don't show error
        if (requests && requests.length > 0) {
            console.warn('Request loading failed but keeping existing data');
            return;
        }

        // Still update the table to show empty state instead of leaving it broken
        requests = [];
        filteredRequests = [];
        updateStatistics();
        renderRequestsTable();

        // Only log to console, don't show popup unless it's critical
        console.warn('Request loading failed. Data will be retried on next interaction.');
    });
}

function updateStatistics() {
    const total = requests.length;
    const submitted = requests.filter(r => r.status === 'submitted').length;
    const processing = requests.filter(r => r.status === 'processing').length;
    const completed = requests.filter(r => r.status === 'completed').length;

    $('#total-requests').text(total);
    $('#submitted-requests').text(submitted);
    $('#processing-requests').text(processing);
    $('#completed-requests').text(completed);
    const failed = requests.filter(r => r.status === 'failed').length;
    $('#failed-requests').text(failed);
}

function filterRequests() {
    const searchTerm = $('#searchRequests').val().toLowerCase().trim();
    const statusFilter = $('#statusFilter').val();
    const dateFilter = $('#dateFilter').val();

    // If user is actively searching/filtering, clear card filter state
    if (searchTerm || statusFilter || dateFilter) {
        currentFilter = 'all';
        $('.kpi-card').removeClass('kpi-active');
        $('#filter-status').hide();
    }

    filteredRequests = requests.filter(request => {
        // Search filter
        const matchesSearch = !searchTerm ||
            request.request_id.toLowerCase().includes(searchTerm) ||
            request.requestor_name.toLowerCase().includes(searchTerm) ||
            request.team_name.toLowerCase().includes(searchTerm) ||
            request.category_name.toLowerCase().includes(searchTerm) ||
            request.request_name.toLowerCase().includes(searchTerm);

        // Status filter
        const matchesStatus = !statusFilter || request.status === statusFilter;

        // Date filter - compare the creation date with selected date
        let matchesDate = true;
        if (dateFilter) {
            const requestDate = new Date(request.created_at).toISOString().split('T')[0];
            matchesDate = requestDate === dateFilter;
        }

        return matchesSearch && matchesStatus && matchesDate;
    });

    // Reset to first page when filtering
    currentPage = 1;
    renderRequestsTable();
}

function renderRequestsTable() {
    const tbody = $('#requestsTableBody');
    tbody.empty();

    const dataToRender = filteredRequests.length > 0 || $('#searchRequests').val() || $('#statusFilter').val() || $('#dateFilter').val() ? filteredRequests : requests;

    if (dataToRender.length === 0) {
        const message = requests.length === 0 ?
            'No requests found. Create your first request!' :
            'No requests match your search criteria.';

        tbody.append(`
            <tr>
                <td colspan="9" class="text-center text-muted">
                    <i class="fas fa-inbox fa-2x mb-2"></i><br>
                    ${message}
                </td>
            </tr>
        `);
        $('#paginationContainer').hide();
        return;
    }

    // Sort data by date (newest first)
    dataToRender.sort((a, b) => new Date(b.request_datetime) - new Date(a.request_datetime));

    // Calculate pagination
    totalPages = Math.ceil(dataToRender.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = dataToRender.slice(startIndex, endIndex);

    // Render table rows for current page
    pageData.forEach(request => {
        const statusClass = `status-${request.status}`;
        const statusIcon = getStatusIcon(request.status);
        const formattedDate = formatDateTime(request.request_datetime);
        const formattedAmount = formatCurrency(request.amount, request.currency);

        const requestDetailsBlob = generateRequestDetailsBlob(request);
        const pipelineStatus = generatePipelineStatus(request.status);

        const row = `
            <tr onclick="viewRequestDetails('${sanitizeHtml(request.request_id)}')" style="cursor: pointer;" title="Click to view details">
                <td><strong>${sanitizeHtml(request.request_id)}</strong></td>
                <td>${sanitizeHtml(request.requestor_name)}</td>
                <td>${formattedDate}</td>
                <td>
                    ${createStatusBadgeWithTooltip(request.status, request.admin_comments, statusClass, statusIcon)}
                </td>
                <td>${pipelineStatus}</td>
                <td>${sanitizeHtml(request.category_name)}</td>
                <td>${formattedAmount}</td>
                <td>${request.adjustment || 0}</td>
                <td class="request-details-blob">${requestDetailsBlob}</td>
            </tr>
        `;
        tbody.append(row);
    });

    // Render pagination controls
    renderPagination(dataToRender.length, startIndex + 1, Math.min(endIndex, dataToRender.length));

    // Initialize custom tooltips
    setTimeout(() => {
        initializeCustomTooltips();
    }, 100);
}

function getStatusIcon(status) {
    switch (status) {
        case 'submitted': return 'fas fa-clock';
        case 'processing': return 'fas fa-cog fa-spin';
        case 'completed': return 'fas fa-check-circle';
        default: return 'fas fa-question-circle';
    }
}

function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCurrency(amount, currencyCode) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode || 'USD'
    }).format(amount || 0);
}

function generatePipelineStatus(status) {
    const stages = [
        { key: 'submitted', label: 'Sub', icon: '1', title: 'Stage 1: Submitted' },
        { key: 'processing', label: 'Pro', icon: '2', title: 'Stage 2: Processing' },
        { key: 'failed', label: 'Fail', icon: '✗', title: 'Stage 3: Failed' },
        { key: 'completed', label: 'Done', icon: '✓', title: 'Stage 4: Completed' }
    ];

    const currentStageIndex = stages.findIndex(stage => stage.key === status);

    let pipelineHtml = '<div class="pipeline-status">';

    stages.forEach((stage, index) => {
        let stepClass = 'pipeline-step ';
        let stepStatus = '';

        if (status === 'failed' && stage.key === 'failed') {
            stepClass += 'failed current';
            stepStatus = ' (Current - Failed)';
        } else if (status === 'completed' && stage.key === 'completed') {
            stepClass += 'completed current';
            stepStatus = ' (Current - Completed)';
        } else if (status === 'completed' && (stage.key === 'submitted' || stage.key === 'processing')) {
            stepClass += 'completed';
            stepStatus = ' (Completed)';
        } else if (index <= currentStageIndex && status !== 'failed') {
            if (index === currentStageIndex) {
                stepClass += 'current';
                stepStatus = ' (Current)';
            } else {
                stepClass += 'completed';
                stepStatus = ' (Completed)';
            }
        } else {
            stepClass += 'pending';
            stepStatus = ' (Pending)';
        }

        const tooltipText = `${stage.title}${stepStatus}`;
        pipelineHtml += `<div class="${stepClass}" title="${tooltipText}" data-stage="${stage.key}">${stage.icon}</div>`;

        // Add connector except for last stage
        if (index < stages.length - 1) {
            let connectorClass = 'pipeline-connector ';
            if (status === 'completed' && index < 2) {
                connectorClass += 'completed';
            } else if (index < currentStageIndex && status !== 'failed') {
                connectorClass += 'completed';
            }
            pipelineHtml += `<div class="${connectorClass}"></div>`;
        }
    });

    pipelineHtml += '</div>';
    return pipelineHtml;
}

function generateRequestDetailsBlob(request) {
    const details = [];

    // Add key request information in a compact format (sanitized)
    if (request.requestor_email) details.push(`📧 Email: ${sanitizeHtml(request.requestor_email)}`);
    if (request.cc_email) details.push(`📧 CC: ${sanitizeHtml(request.cc_email)}`);
    if (request.team_name) details.push(`👥 Team: ${sanitizeHtml(request.team_name)}`);
    if (request.acct_number) details.push(`🏦 Account: ${sanitizeHtml(request.acct_number)}`);
    if (request.request_name) details.push(`📝 Name: ${sanitizeHtml(request.request_name)}`);
    if (request.request_dates) {
        const dateCount = request.request_dates.split(',').length;
        const datesList = request.request_dates.split(',').map(d => sanitizeHtml(d.trim())).join(', ');
        details.push(`📅 Dates (${dateCount}): ${datesList}`);
    }
    if (request.description) {
        details.push(`💬 Description: ${sanitizeHtml(request.description)}`);
    }
    if (request.currency && request.amount) {
        details.push(`💰 Amount: ${formatCurrency(request.amount, request.currency)}`);
    }
    if (request.adjustment !== undefined) {
        details.push(`🔧 Adjustment: ${request.adjustment}`);
    }

    // Create tooltip content
    const tooltipContent = details.join('\n');

    return `<a href="#" class="details-link"
                onclick="event.preventDefault(); event.stopPropagation(); viewRequestDetails('${request.request_id}');"
                title="${tooltipContent.replace(/"/g, '&quot;')}"
                data-toggle="tooltip"
                data-placement="left"
                data-html="true">
                <i class="fas fa-info-circle"></i> View Details
            </a>`;
}

function viewRequestDetails(requestId) {
    const request = requests.find(r => r.request_id === requestId);
    if (!request) return;

    const detailsHtml = `
        <div class="row">
            <div class="col-md-6">
                <h6>Requester Details</h6>
                <p><strong>Name:</strong> ${sanitizeHtml(request.requestor_name)}</p>
                <p><strong>Email:</strong> ${sanitizeHtml(request.requestor_email)}</p>
                <p><strong>CC Email:</strong> ${sanitizeHtml(request.cc_email || 'N/A')}</p>
                <p><strong>Team:</strong> ${sanitizeHtml(request.team_name)}</p>
            </div>
            <div class="col-md-6">
                <h6>Request Details</h6>
                <p><strong>Category:</strong> ${sanitizeHtml(request.category_name)}</p>
                <p><strong>Account Number:</strong> ${sanitizeHtml(request.acct_number)}</p>
                <p><strong>Name:</strong> ${sanitizeHtml(request.request_name)}</p>
                <p><strong>Amount:</strong> ${formatCurrency(request.amount, request.currency)}</p>
                <p><strong>Dates:</strong> ${sanitizeHtml(request.request_dates)}</p>
            </div>
        </div>
        ${request.description ? `<div class="mt-3"><h6>Description</h6><p>${sanitizeHtml(request.description)}</p></div>` : ''}
    `;

    showInfoModal('Request Details', detailsHtml);
}

// Status updates are handled by Spark script - removed updateRequestStatus function

function refreshRequests() {
    showLoadingSpinner();

    // Reset auto-refresh countdown when manually refreshed
    if (autoRefreshEnabled) {
        autoRefreshCountdown = 30;
        updateCountdownDisplay();
    }

    loadRequests()
        .then(() => {
            hideLoadingSpinner();
            showSuccessMessage('Refreshed!', 'Request data has been refreshed.');
        })
        .catch(() => {
            hideLoadingSpinner();
            showErrorMessage('Refresh Failed', 'Unable to refresh data. Please try again.');
        });
}

// Logout function already defined above at line 100

// Utility Functions

// XSS Protection - Sanitize HTML content
function sanitizeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoadingSpinner() {
    $('#loadingSpinner').show();
}

function hideLoadingSpinner() {
    $('#loadingSpinner').hide();
}

function showSuccessMessage(title, message) {
    $('#messageModalHeader').removeClass('bg-danger').addClass('bg-success');
    $('#messageModalTitle').html(`<i class="fas fa-check-circle mr-2"></i>${title}`);
    $('#messageModalBody').html(message);
    $('#messageModal').modal('show');
}

function showErrorMessage(title, message) {
    $('#messageModalHeader').removeClass('bg-success').addClass('bg-danger');
    $('#messageModalTitle').html(`<i class="fas fa-exclamation-triangle mr-2"></i>${title}`);
    $('#messageModalBody').html(message);
    $('#messageModal').modal('show');
}

function showMessage(type, title, message) {
    if (type === 'success') {
        showSuccessMessage(title, message);
    } else if (type === 'error') {
        showErrorMessage(title, message);
    }
}

function showInfoModal(title, content) {
    $('#messageModalHeader').removeClass('bg-success bg-danger');
    $('#messageModalTitle').html(`<i class="fas fa-info-circle mr-2"></i>${title}`);
    $('#messageModalBody').html(content);
    $('#messageModal').modal('show');
}

// Date Range Management Functions
let dateRangeCounter = 0;

function addDateRange() {
    dateRangeCounter++;
    const rangeHtml = `
        <div class="date-range-item" data-range-id="${dateRangeCounter}">
            <div class="date-range-inputs">
                <input type="date" class="form-control range-start" placeholder="Start Date" required>
                <span class="date-separator">to</span>
                <input type="date" class="form-control range-end" placeholder="End Date" required>
                <button type="button" class="btn btn-remove-range">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="date-range-preview"></div>
        </div>
    `;

    $('#dateRangesList').append(rangeHtml);

    // Add event listeners for the new date inputs
    const $newRange = $(`.date-range-item[data-range-id="${dateRangeCounter}"]`);
    $newRange.find('.range-start, .range-end').on('change', function() {
        updateRangePreview($newRange);
    });
}

function updateRangePreview($rangeElement) {
    const startDate = $rangeElement.find('.range-start').val();
    const endDate = $rangeElement.find('.range-end').val();
    const $preview = $rangeElement.find('.date-range-preview');

    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (start > end) {
            $preview.html('<span class="text-danger">Invalid: End before start</span>');
        } else {
            const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            $preview.html(`<span class="text-success">${daysDiff} days (${startDate} to ${endDate})</span>`);
        }
    } else {
        $preview.empty();
    }
}

function updateDateRangesPreview() {
    $('.date-range-item').each(function() {
        updateRangePreview($(this));
    });
}

function collectDateRanges() {
    const allDates = [];
    let hasErrors = false;

    $('.date-range-item').each(function() {
        const startDate = $(this).find('.range-start').val();
        const endDate = $(this).find('.range-end').val();

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);

            if (start > end) {
                hasErrors = true;
                return;
            }

            // Generate all dates between start and end (inclusive)
            const currentDate = new Date(start);
            while (currentDate <= end) {
                allDates.push(currentDate.toISOString().split('T')[0]);
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
    });

    if (hasErrors) {
        showErrorMessage('Date Range Error', 'Please ensure all date ranges have valid start and end dates.');
        return '';
    }

    return allDates.join(',');
}

function validateDateRanges() {
    let isValid = true;

    $('.date-range-item').each(function() {
        const startDate = $(this).find('.range-start').val();
        const endDate = $(this).find('.range-end').val();

        if (!startDate || !endDate) {
            isValid = false;
        } else {
            const start = new Date(startDate);
            const end = new Date(endDate);

            if (start > end) {
                isValid = false;
            }
        }
    });

    return isValid;
}

// Enhanced Form Validation Functions
function validateField($field) {
    const value = $field.val().trim();
    const isRequired = $field.prop('required');

    if (isRequired && value === '') {
        $field.removeClass('is-valid').addClass('is-invalid');
        return false;
    } else if (value !== '') {
        $field.removeClass('is-invalid').addClass('is-valid');
        return true;
    } else {
        $field.removeClass('is-invalid is-valid');
        return true;
    }
}

function validateEmailField($field) {
    const email = $field.val().trim();
    const isRequired = $field.prop('required');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (isRequired && email === '') {
        $field.removeClass('is-valid').addClass('is-invalid');
        return false;
    } else if (email !== '' && !emailRegex.test(email)) {
        $field.removeClass('is-valid').addClass('is-invalid');
        return false;
    } else if (email !== '' && emailRegex.test(email)) {
        $field.removeClass('is-invalid').addClass('is-valid');
        return true;
    } else {
        $field.removeClass('is-invalid is-valid');
        return true;
    }
}

function validateNumberField($field) {
    const value = $field.val();
    const numValue = parseFloat(value);
    const min = parseFloat($field.attr('min'));
    const isRequired = $field.prop('required');

    if (isRequired && (value === '' || isNaN(numValue))) {
        $field.removeClass('is-valid').addClass('is-invalid');
        return false;
    } else if (value !== '' && (isNaN(numValue) || (min !== undefined && numValue < min))) {
        $field.removeClass('is-valid').addClass('is-invalid');
        return false;
    } else if (value !== '' && !isNaN(numValue)) {
        $field.removeClass('is-invalid').addClass('is-valid');
        return true;
    } else {
        $field.removeClass('is-invalid is-valid');
        return true;
    }
}

function validateForm($form) {
    let isValid = true;

    $form.find('.form-control[required]').each(function() {
        // Skip validation for hidden, disabled, or invisible fields
        if ($(this).is(':hidden') || $(this).is(':disabled') ||
            $(this).closest('.date-range-item').is(':hidden') ||
            $(this).closest('.d-none').length > 0) {
            return true; // Skip this field
        }

        if (!validateField($(this))) {
            isValid = false;
        }
    });

    $form.find('input[type="email"]').each(function() {
        if (!validateEmailField($(this))) {
            isValid = false;
        }
    });

    $form.find('input[type="number"]').each(function() {
        if (!validateNumberField($(this))) {
            isValid = false;
        }
    });

    // Validate date ranges if range input type is selected
    if ($('input[name="dateInputType"]:checked').val() === 'range') {
        if ($('#dateRangesList').children().length === 0) {
            showErrorMessage('Date Range Error', 'Please add at least one date range.');
            isValid = false;
        } else if (!validateDateRanges()) {
            showErrorMessage('Date Range Error', 'Please ensure all date ranges have valid start and end dates.');
            isValid = false;
        }
    }

    return isValid;
}

// Initialize date input state based on default selection
function initializeDateInputState() {
    const selectedType = $('input[name="dateInputType"]:checked').val();
    if (selectedType === 'calendar') {
        // Calendar mode: hide range inputs and remove required
        $('#requestDates').show().prop('required', true);
        $('#dateRangeContainer').hide();
        $('#dateRangeContainer .range-start, #dateRangeContainer .range-end').prop('required', false);
    } else if (selectedType === 'range') {
        // Range mode: hide calendar and ensure range inputs are required
        $('#requestDates').hide().prop('required', false);
        $('#dateRangeContainer').show();
        $('#dateRangeContainer .range-start, #dateRangeContainer .range-end').prop('required', true);
    }
}

function initializeAutoRefresh() {
    // Set up event listener for auto-refresh toggle
    $('#autoRefreshToggle').on('change', function() {
        autoRefreshEnabled = $(this).is(':checked');
        if (autoRefreshEnabled) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });

    // Start auto-refresh by default
    startAutoRefresh();
}

function startAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
    }
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }

    // Reset countdown
    autoRefreshCountdown = 30;
    updateCountdownDisplay();

    // Start countdown timer (updates every second)
    countdownTimer = setInterval(() => {
        autoRefreshCountdown--;
        updateCountdownDisplay();

        if (autoRefreshCountdown <= 0) {
            if (autoRefreshEnabled && $('#dashboard').hasClass('active')) {
                console.log('Auto-refreshing requests...');
                loadRequests().catch(error => {
                    console.warn('Auto-refresh failed, will retry next cycle:', error.message);
                });
            }
            autoRefreshCountdown = 30; // Reset for next cycle
        }
    }, 1000);
}

function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
    }
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }
    $('#autoRefreshTimer').text('OFF').addClass('paused');
}

function updateCountdownDisplay() {
    if (autoRefreshEnabled) {
        $('#autoRefreshTimer').text(`${autoRefreshCountdown}s`).removeClass('paused');
    } else {
        $('#autoRefreshTimer').text('OFF').addClass('paused');
    }
}

// Legacy auto-refresh - now handled by the new system
// let autoRefreshInterval = setInterval(() => {
//     if ($('#dashboard').hasClass('active')) {
//         console.log('Auto-refreshing requests...');
//         loadRequests().catch(error => {
//             console.warn('Auto-refresh failed, will retry next cycle:', error.message);
//         });
//     }
// }, 30000);

// Clear intervals when page unloads
$(window).on('beforeunload', function() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
    }
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }
});

// ==================== ADMIN DASHBOARD FUNCTIONS ====================

let adminChart = null;

// Admin authentication and tab visibility
function initializeAdminAccess() {
    // This is now handled in checkAuthentication function
    // Keep this function for backwards compatibility but it's not needed
    return;
}

// Load admin dashboard data
function loadAdminDashboard() {
    if (!$('#admin-dashboard').hasClass('active')) return;

    showLoadingSpinner();

    Promise.all([
        fetch(`${API_BASE_URL}/admin/analytics`).then(r => r.json()),
        fetch(`${API_BASE_URL}/admin/status-history`).then(r => r.json()),
        fetch(`${API_BASE_URL}/admin/recent-activity`).then(r => r.json()),
        fetch(`${API_BASE_URL}/admin/trends?period=${currentTrendsPeriod}`).then(r => r.json())
    ])
    .then(([analytics, statusHistory, recentActivity, trends]) => {
        updateAdminSummaryCards(analytics);
        updateAdminBreakdownTables(analytics, statusHistory);
        updateAdminRecentActivity(recentActivity);
        updateAdminTrendsChart(trends);
        hideLoadingSpinner();
    })
    .catch(error => {
        console.error('Error loading admin dashboard:', error);
        hideLoadingSpinner();
        showErrorMessage('Load Error', 'Failed to load admin dashboard data');
    });
}

// Update summary cards
function updateAdminSummaryCards(data) {
    $('#admin-total-users').text(data.users?.total || 0);
    $('#admin-daily-active').text(data.users?.daily_active || 0);
    $('#admin-total-requests').text(data.requests?.total || 0);
    $('#admin-daily-requests').text(data.requests?.today || 0);
    $('#admin-completed-rate').text((data.requests?.completed_percentage || 0) + '%');
    $('#admin-failed-rate').text((data.requests?.failed_percentage || 0) + '%');
    $('#admin-total-status-changes').text(data.status_changes?.total || 0);
    $('#admin-recent-changes').text(data.status_changes?.last_24h || 0);
}

// Update breakdown tables
function updateAdminBreakdownTables(analytics, statusHistory) {
    // Users breakdown
    const usersTableBody = $('#admin-users-breakdown');
    usersTableBody.empty();

    if (analytics.usersBreakdown && analytics.usersBreakdown.length > 0) {
        analytics.usersBreakdown.forEach(team => {
            const row = `
                <tr>
                    <td><strong>${team.team}</strong></td>
                    <td><span class="badge badge-primary">${team.userCount}</span></td>
                    <td><span class="badge badge-info">${team.requestCount}</span></td>
                    <td><span class="badge badge-success">${team.activeUsers || 0}</span></td>
                </tr>
            `;
            usersTableBody.append(row);
        });
    } else {
        usersTableBody.append('<tr><td colspan="4" class="text-center text-muted">No data available</td></tr>');
    }

    // Requests breakdown
    const requestsTableBody = $('#admin-requests-breakdown');
    requestsTableBody.empty();

    if (analytics.requestsBreakdown && analytics.requestsBreakdown.length > 0) {
        analytics.requestsBreakdown.forEach(status => {
            const statusClass = getStatusClass(status.status);
            const row = `
                <tr>
                    <td><span class="status-badge ${statusClass}">${status.status}</span></td>
                    <td><span class="badge badge-secondary">${status.count}</span></td>
                    <td><strong>${status.percentage || 0}%</strong></td>
                    <td>${Math.round(status.avgDays || 0)} days</td>
                </tr>
            `;
            requestsTableBody.append(row);
        });
    } else {
        requestsTableBody.append('<tr><td colspan="4" class="text-center text-muted">No data available</td></tr>');
    }

    // Status history breakdown
    const historyTableBody = $('#admin-history-breakdown');
    historyTableBody.empty();

    if (statusHistory && statusHistory.length > 0) {
        statusHistory.slice(0, 10).forEach(change => {
            const lastChangeDate = new Date(change.lastChange).toLocaleDateString();
            const row = `
                <tr>
                    <td><code>${change.status}</code></td>
                    <td><span class="badge badge-info">${change.count}</span></td>
                    <td><small>${lastChangeDate}</small></td>
                    <td><small>${change.mostActiveUser || 'N/A'}</small></td>
                </tr>
            `;
            historyTableBody.append(row);
        });
    } else {
        historyTableBody.append('<tr><td colspan="4" class="text-center text-muted">No data available</td></tr>');
    }
}

// Update recent activity timeline
function updateAdminRecentActivity(activities) {
    const timeline = $('#admin-recent-activity');
    timeline.empty();

    if (activities && activities.length > 0) {
        activities.forEach(activity => {
            const changeDate = new Date(activity.updated_at).toLocaleString();
            const isNew = activity.created_at === activity.updated_at;
            const changeType = isNew ?
                `Created as ${activity.status}` :
                `Updated to ${activity.status}`;

            const timelineItem = `
                <div class="timeline-item mb-3 p-2 border-left border-primary">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <strong>${activity.title}</strong>
                            <br>
                            <small class="text-muted">${changeType}</small>
                            <br>
                            <small>by ${activity.requester} (${activity.team})</small>
                        </div>
                        <div class="text-right">
                            <small class="text-muted">${changeDate}</small>
                        </div>
                    </div>
                </div>
            `;
            timeline.append(timelineItem);
        });
    } else {
        timeline.append('<p class="text-center text-muted">No recent activity</p>');
    }
}

// Update trends chart
function updateAdminTrendsChart(trendsData) {
    const ctx = document.getElementById('admin-trends-chart');
    if (!ctx) {
        console.log('Chart canvas not found');
        return;
    }

    console.log('Trends data received:', trendsData);

    // Destroy existing chart if it exists
    if (adminChart) {
        adminChart.destroy();
    }

    if (!trendsData || trendsData.length === 0) {
        const emptyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'No data available for the selected period'
                    }
                }
            }
        });
        return;
    }

    // Sort data by period (oldest first for proper chronological order)
    // Handle both daily and monthly data
    const dateField = trendsData[0].month ? 'month' : 'day';
    const sortedData = trendsData.sort((a, b) => a[dateField].localeCompare(b[dateField]));

    const labels = sortedData.map(d => d[dateField]);
    const requestCounts = sortedData.map(d => parseInt(d.total_requests) || 0);
    const completedCounts = sortedData.map(d => parseInt(d.completed) || 0);
    const failedCounts = sortedData.map(d => parseInt(d.failed) || 0);
    const uniqueUsers = sortedData.map(d => d.uniqueUsers || 0);

    adminChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Requests',
                data: requestCounts,
                borderColor: 'rgb(54, 162, 235)',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                tension: 0.1,
                yAxisID: 'y'
            }, {
                label: 'Completed Requests',
                data: completedCounts,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                tension: 0.1,
                yAxisID: 'y'
            }, {
                label: 'Failed Requests',
                data: failedCounts,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                tension: 0.1,
                yAxisID: 'y'
            }, {
                label: 'Unique Users',
                data: uniqueUsers,
                borderColor: 'rgb(255, 205, 86)',
                backgroundColor: 'rgba(255, 205, 86, 0.1)',
                tension: 0.1,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Month'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Number of Requests'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Number of Users'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                }
            }
        }
    });
}

// Refresh admin dashboard
function refreshAdminDashboard() {
    loadAdminDashboard();
}

// Helper function to get status class
function getStatusClass(status) {
    switch(status?.toLowerCase()) {
        case 'submitted': return 'status-submitted';
        case 'processing': return 'status-processing';
        case 'completed': return 'status-completed';
        case 'failed': return 'status-failed';
        default: return 'status-unknown';
    }
}

// Global variable to store current filter
let currentFilter = 'all';

// Filter requests by status
function filterRequestsByStatus(status) {
    currentFilter = status;

    // Remove active class from all KPI cards
    $('.kpi-card').removeClass('kpi-active');

    // Add active class to clicked card
    $(`[onclick="filterRequestsByStatus('${status}')"]`).addClass('kpi-active');

    // Show filter status
    if (status === 'all') {
        $('#filter-status').hide();
        // Clear the status filter dropdown to show "All Status" when showing all
        $('#statusFilter').val('');
    } else {
        const statusText = status.charAt(0).toUpperCase() + status.slice(1);
        $('#filter-text').text(`Showing ${statusText} requests only`);
        $('#filter-status').show();
        // Update the status filter dropdown to match the card filter
        $('#statusFilter').val(status);

        // Clear search and date filters when applying card filter to avoid confusion
        $('#searchRequests').val('');
        $('#dateFilter').val('');
    }

    // Apply filter to the underlying data instead of just DOM manipulation
    if (status === 'all') {
        // Reset filteredRequests to show all data
        filteredRequests = [];
    } else {
        // Filter the requests data by status
        filteredRequests = requests.filter(request => request.status === status);
    }

    // Reset to first page when filtering
    currentPage = 1;

    // Re-render the table with filtered data
    renderRequestsTable();

    console.log('Filtering for status:', status);
    console.log('Total requests:', requests.length);
    console.log('Filtered requests:', filteredRequests.length);
}

// Clear filter and show all requests
function clearFilter() {
    currentFilter = 'all';

    // Remove active class from all KPI cards
    $('.kpi-card').removeClass('kpi-active');

    // Hide filter status
    $('#filter-status').hide();

    // Clear the status filter dropdown
    $('#statusFilter').val('');

    // Reset filteredRequests to show all data
    filteredRequests = [];

    // Reset to first page when clearing filter
    currentPage = 1;

    // Re-render the table with all data
    renderRequestsTable();
}

// Update table header with count
function updateTableHeaderCount() {
    // Use the actual data counts instead of DOM element counts
    const dataToRender = filteredRequests.length > 0 || $('#searchRequests').val() || $('#statusFilter').val() || $('#dateFilter').val() ? filteredRequests : requests;
    const totalCount = dataToRender.length;
    const allRequestsCount = requests.length;

    if (currentFilter === 'all') {
        $('#requests-card-title').text(`All Requests (${allRequestsCount})`);
    } else {
        const statusText = currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1);
        $('#requests-card-title').text(`${statusText} Requests (${totalCount})`);
    }
}

// Initialize admin access when page loads
$(document).ready(function() {
    initializeAdminAccess();

    // Load admin dashboard when tab is activated
    $('#admin-dashboard-tab').on('shown.bs.tab', function() {
        loadAdminDashboard();
    });

    // Add CSS for KPI card hover effects
    $('<style>')
        .prop('type', 'text/css')
        .html(`
            .kpi-card:hover {
                transform: translateY(-3px) !important;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15) !important;
            }
            .kpi-card.kpi-active {
                transform: translateY(-3px) !important;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.25) !important;
                border: 2px solid rgba(255, 255, 255, 0.5) !important;
            }
        `)
        .appendTo('head');
});

// ==================== USER MANAGEMENT ====================

let allUsers = [];

// ==================== PAGINATION FUNCTIONS ====================

function renderPagination(totalItems, startItem, endItem) {
    const paginationContainer = $('#paginationContainer');
    const paginationInfo = $('#paginationInfo');
    const paginationControls = $('#paginationControls');

    if (totalItems <= itemsPerPage) {
        paginationContainer.hide();
        return;
    }

    // Update pagination info
    paginationInfo.text(`Showing ${startItem} to ${endItem} of ${totalItems} results`);

    // Clear existing page numbers
    paginationControls.find('li:not(#prevPage):not(#nextPage)').remove();

    // Calculate page number range to display
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    // Adjust start page if we're near the end
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // Add page numbers
    for (let i = startPage; i <= endPage; i++) {
        const pageItem = $(`
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `);
        pageItem.insertBefore('#nextPage');
    }

    // Update prev/next buttons
    $('#prevPage').toggleClass('disabled', currentPage === 1);
    $('#nextPage').toggleClass('disabled', currentPage === totalPages);

    paginationContainer.show();
}

function changePage(page) {
    if (page < 1 || page > totalPages || page === currentPage) {
        return;
    }
    currentPage = page;
    renderRequestsTable();
}

// Add pagination event listeners
function setupPaginationEventListeners() {
    // Previous page
    $(document).on('click', '#prevPage a', function(e) {
        e.preventDefault();
        if (currentPage > 1) {
            changePage(currentPage - 1);
        }
    });

    // Next page
    $(document).on('click', '#nextPage a', function(e) {
        e.preventDefault();
        if (currentPage < totalPages) {
            changePage(currentPage + 1);
        }
    });

    // Specific page
    $(document).on('click', '#paginationControls a[data-page]', function(e) {
        e.preventDefault();
        const page = parseInt($(this).data('page'));
        changePage(page);
    });
}

// ==================== USER MANAGEMENT ====================

// Load user management data
function loadUserManagement() {
    if (!currentUser || !currentUser.isAdmin) {
        console.log('Access denied: User is not admin');
        return;
    }

    fetch('http://localhost:3000/api/admin/users', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            allUsers = data.users;
            displayUsers(allUsers);
            updateUserStatistics(allUsers);
        } else {
            console.error('Failed to load users:', data.error);
            showMessage('error', 'Failed to load users', data.error);
        }
    })
    .catch(error => {
        console.error('Error loading users:', error);
        showMessage('error', 'Error', 'Failed to load users');
    });
}

// Display users in table
function displayUsers(users) {
    const tbody = $('#usersTableBody');
    tbody.empty();

    if (users.length === 0) {
        $('#noUsersMessage').show();
        return;
    }

    $('#noUsersMessage').hide();

    users.forEach(user => {
        const row = $(`
            <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.email || '')}</td>
                <td>${escapeHtml(user.team || '')}</td>
                <td>
                    <span class="badge ${getStatusBadgeClass(user.status)}">
                        ${getStatusText(user.status)}
                    </span>
                </td>
                <td>
                    <span class="badge ${user.isAdmin ? 'badge-danger' : 'badge-secondary'}">
                        ${user.isAdmin ? 'Admin' : 'User'}
                    </span>
                </td>
                <td>${formatDate(user.created_at)}</td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        ${getActionButtons(user)}
                    </div>
                </td>
            </tr>
        `);
        tbody.append(row);
    });
}

// Get status badge class
function getStatusBadgeClass(status) {
    switch(status) {
        case 'pending': return 'badge-warning';
        case 'approved': return 'badge-success';
        case 'disabled': return 'badge-danger';
        default: return 'badge-secondary';
    }
}

// Get status text
function getStatusText(status) {
    switch(status) {
        case 'pending': return 'Pending';
        case 'approved': return 'Approved';
        case 'disabled': return 'Disabled';
        default: return 'Unknown';
    }
}

// Get action buttons for user
function getActionButtons(user) {
    let buttons = '';

    // Status actions
    if (user.status === 'pending') {
        buttons += `<button class="btn btn-success btn-sm" onclick="approveUser(${user.id})" title="Approve User">
                        <i class="fas fa-check"></i>
                    </button>`;
    }

    if (user.status !== 'disabled') {
        buttons += `<button class="btn btn-warning btn-sm" onclick="disableUser(${user.id})" title="Disable User">
                        <i class="fas fa-ban"></i>
                    </button>`;
    } else {
        buttons += `<button class="btn btn-info btn-sm" onclick="enableUser(${user.id})" title="Enable User">
                        <i class="fas fa-check-circle"></i>
                    </button>`;
    }

    // Role toggle
    if (!user.isAdmin && user.username !== 'admin') {
        buttons += `<button class="btn btn-secondary btn-sm" onclick="makeAdmin(${user.id})" title="Make Admin">
                        <i class="fas fa-user-shield"></i>
                    </button>`;
    } else if (user.isAdmin && user.username !== 'admin') {
        buttons += `<button class="btn btn-outline-secondary btn-sm" onclick="removeAdmin(${user.id})" title="Remove Admin">
                        <i class="fas fa-user"></i>
                    </button>`;
    }

    // Edit/Reset/Delete actions
    buttons += `<button class="btn btn-primary btn-sm" onclick="editUser(${user.id})" title="Edit User">
                    <i class="fas fa-edit"></i>
                </button>`;

    buttons += `<button class="btn btn-info btn-sm" onclick="resetPassword(${user.id})" title="Reset Password">
                    <i class="fas fa-key"></i>
                </button>`;

    if (user.username !== 'admin') {
        buttons += `<button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id})" title="Delete User">
                        <i class="fas fa-trash"></i>
                    </button>`;
    }

    return buttons;
}

// Update user statistics
function updateUserStatistics(users) {
    const total = users.length;
    const pending = users.filter(u => u.status === 'pending').length;
    const approved = users.filter(u => u.status === 'approved').length;
    const disabled = users.filter(u => u.status === 'disabled').length;

    $('#total-users-count').text(total);
    $('#pending-users-count').text(pending);
    $('#approved-users-count').text(approved);
    $('#disabled-users-count').text(disabled);
}

// Approve user
function approveUser(userId) {
    updateUserStatus(userId, 'approved', 'User approved successfully');
}

// Disable user
function disableUser(userId) {
    if (confirm('Are you sure you want to disable this user?')) {
        updateUserStatus(userId, 'disabled', 'User disabled successfully');
    }
}

// Enable user
function enableUser(userId) {
    updateUserStatus(userId, 'approved', 'User enabled successfully');
}

// Update user status
function updateUserStatus(userId, status, successMessage) {
    fetch(`http://localhost:3000/api/admin/users/${userId}/status`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('success', 'Success', successMessage);
            loadUserManagement(); // Refresh the list
        } else {
            showMessage('error', 'Error', data.error);
        }
    })
    .catch(error => {
        console.error('Error updating user status:', error);
        showMessage('error', 'Error', 'Failed to update user status');
    });
}

// Make user admin
function makeAdmin(userId) {
    if (confirm('Are you sure you want to give admin privileges to this user?')) {
        updateUserRole(userId, true, 'User promoted to admin successfully');
    }
}

// Remove admin privileges
function removeAdmin(userId) {
    if (confirm('Are you sure you want to remove admin privileges from this user?')) {
        updateUserRole(userId, false, 'Admin privileges removed successfully');
    }
}

// Update user role
function updateUserRole(userId, isAdmin, successMessage) {
    fetch(`http://localhost:3000/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isAdmin })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('success', 'Success', successMessage);
            loadUserManagement(); // Refresh the list
        } else {
            showMessage('error', 'Error', data.error);
        }
    })
    .catch(error => {
        console.error('Error updating user role:', error);
        showMessage('error', 'Error', 'Failed to update user role');
    });
}

// Reset user password
function resetPassword(userId) {
    const newPassword = prompt('Enter new password (minimum 6 characters):');

    if (newPassword === null) return; // User cancelled

    if (newPassword.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }

    fetch(`http://localhost:3000/api/admin/users/${userId}/password`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('success', 'Success', 'Password reset successfully');
        } else {
            showMessage('error', 'Error', data.error);
        }
    })
    .catch(error => {
        console.error('Error resetting password:', error);
        showMessage('error', 'Error', 'Failed to reset password');
    });
}

// Delete user
function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        fetch(`http://localhost:3000/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showMessage('success', 'Success', 'User deleted successfully');
                loadUserManagement(); // Refresh the list
            } else {
                showMessage('error', 'Error', data.error);
            }
        })
        .catch(error => {
            console.error('Error deleting user:', error);
            showMessage('error', 'Error', 'Failed to delete user');
        });
    }
}

// Edit user (simplified version)
function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const newEmail = prompt('Enter new email:', user.email);
    if (newEmail === null) return;

    const newTeam = prompt('Enter new team:', user.team);
    if (newTeam === null) return;

    const newDescription = prompt('Enter new description:', user.description || '');
    if (newDescription === null) return;

    fetch(`http://localhost:3000/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: newEmail,
            team: newTeam,
            description: newDescription
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('success', 'Success', 'User updated successfully');
            loadUserManagement(); // Refresh the list
        } else {
            showMessage('error', 'Error', data.error);
        }
    })
    .catch(error => {
        console.error('Error updating user:', error);
        showMessage('error', 'Error', 'Failed to update user');
    });
}

// Refresh user management
function refreshUserManagement() {
    loadUserManagement();
}

// Filter users
function filterUsers() {
    const statusFilter = $('#userStatusFilter').val().toLowerCase();
    const searchTerm = $('#searchUsers').val().toLowerCase();

    let filteredUsers = allUsers;

    // Apply status filter
    if (statusFilter) {
        filteredUsers = filteredUsers.filter(user =>
            user.status && user.status.toLowerCase() === statusFilter
        );
    }

    // Apply search filter
    if (searchTerm) {
        filteredUsers = filteredUsers.filter(user =>
            (user.username && user.username.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm)) ||
            (user.team && user.team.toLowerCase().includes(searchTerm))
        );
    }

    displayUsers(filteredUsers);
}

// Event listeners for user management
$(document).ready(function() {
    // Add event listeners for user management filters
    $('#userStatusFilter').on('change', filterUsers);
    $('#searchUsers').on('input', filterUsers);

    // Load user management when tab is shown
    $('#user-management-tab').on('shown.bs.tab', function () {
        loadUserManagement();
    });
});

// Utility functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function createStatusBadgeWithTooltip(status, adminComments, statusClass, statusIcon) {
    if (adminComments && adminComments.trim()) {
        return `<span class="status-badge ${statusClass} custom-tooltip" data-tooltip="Admin: ${escapeHtml(adminComments)}">
                    <i class="${statusIcon} mr-1"></i>${sanitizeHtml(status)}
                </span>`;
    }

    return `<span class="status-badge ${statusClass}">
                <i class="${statusIcon} mr-1"></i>${sanitizeHtml(status)}
            </span>`;
}

// Request Status Override Functions
let allRequestsOverride = [];
let currentRequestOverride = null;

function refreshRequestOverride() {
    console.log('Refreshing request override data...');
    showLoadingSpinner();

    // Admin should see all requests
    const params = new URLSearchParams({
        isAdmin: 'true',
        username: currentUser ? currentUser.username : 'admin'
    });

    fetch(`/api/requests?${params}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Request override data loaded:', data);
        allRequestsOverride = data.data || [];
        displayRequestOverrideTable();
    })
    .catch(error => {
        console.error('Error loading request override data:', error);
        showMessage('Error loading requests: ' + error.message, 'error');
    })
    .finally(() => {
        hideLoadingSpinner();
    });
}

function displayRequestOverrideTable() {
    const tbody = $('#requestOverrideTableBody');
    tbody.empty();

    if (!allRequestsOverride || allRequestsOverride.length === 0) {
        tbody.append(`
            <tr>
                <td colspan="7" class="text-center text-muted py-3">
                    <i class="fas fa-inbox mr-2"></i>No requests found
                </td>
            </tr>
        `);
        return;
    }

    allRequestsOverride.forEach(request => {
        const statusBadge = getStatusBadge(request.status, request.admin_comments);
        const truncatedDescription = request.description && request.description.length > 50
            ? request.description.substring(0, 50) + '...'
            : request.description || '';

        const row = `
            <tr>
                <td><strong>${escapeHtml(request.request_id || '')}</strong></td>
                <td>${escapeHtml(request.requestor_name || '')}</td>
                <td title="${escapeHtml(request.description || '')}">${escapeHtml(truncatedDescription)}</td>
                <td>${request.currency || 'USD'} ${(request.amount || 0).toLocaleString()}</td>
                <td>${statusBadge}</td>
                <td>${formatDate(request.created_at)}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="openStatusOverrideModal(${request.id})">
                        <i class="fas fa-edit mr-1"></i>Change Status
                    </button>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function getStatusBadge(status, adminComments) {
    let badgeClass = 'secondary';
    let icon = 'fas fa-question';

    switch (status?.toLowerCase()) {
        case 'submitted':
            badgeClass = 'primary';
            icon = 'fas fa-paper-plane';
            break;
        case 'processing':
            badgeClass = 'warning';
            icon = 'fas fa-clock';
            break;
        case 'completed':
            badgeClass = 'success';
            icon = 'fas fa-check';
            break;
        case 'failed':
            badgeClass = 'danger';
            icon = 'fas fa-times';
            break;
    }

    const statusText = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';

    if (adminComments && adminComments.trim()) {
        return `<span class="badge badge-${badgeClass} custom-tooltip" data-tooltip="Admin: ${escapeHtml(adminComments)}">
                    <i class="${icon} mr-1"></i>${statusText}
                </span>`;
    }

    return `<span class="badge badge-${badgeClass}"><i class="${icon} mr-1"></i>${statusText}</span>`;
}

function filterRequestOverride() {
    const searchTerm = $('#requestOverrideSearch').val().toLowerCase();
    const statusFilter = $('#statusFilterOverride').val();

    let filteredRequests = allRequestsOverride;

    if (searchTerm) {
        filteredRequests = filteredRequests.filter(request =>
            (request.request_id && request.request_id.toLowerCase().includes(searchTerm)) ||
            (request.requestor_name && request.requestor_name.toLowerCase().includes(searchTerm)) ||
            (request.description && request.description.toLowerCase().includes(searchTerm))
        );
    }

    if (statusFilter !== 'all') {
        filteredRequests = filteredRequests.filter(request =>
            request.status && request.status.toLowerCase() === statusFilter
        );
    }

    // Temporarily store filtered results
    const originalRequests = allRequestsOverride;
    allRequestsOverride = filteredRequests;
    displayRequestOverrideTable();
    allRequestsOverride = originalRequests;
}

function openStatusOverrideModal(requestId) {
    const request = allRequestsOverride.find(r => r.id === requestId);
    if (!request) {
        showMessage('Request not found!', 'error');
        return;
    }

    currentRequestOverride = request;

    $('#overrideRequestId').val(request.request_id || '');
    $('#overrideCurrentStatus').val(request.status ? request.status.charAt(0).toUpperCase() + request.status.slice(1) : 'Unknown');
    $('#overrideNewStatus').val('');
    $('#overrideFailureMessage').val(request.admin_comments || '');

    $('#statusOverrideModal').modal('show');
}

function toggleFailureMessage() {
    const selectedStatus = $('#overrideNewStatus').val();
    // Admin comments are now always visible for all status changes
}

function updateRequestStatus() {
    if (!currentRequestOverride) {
        showMessage('No request selected!', 'error');
        return;
    }

    const newStatus = $('#overrideNewStatus').val();
    const failureMessage = $('#overrideFailureMessage').val();

    if (!newStatus) {
        showMessage('Please select a status!', 'error');
        return;
    }

    // Comments are now optional for all statuses

    const requestData = {
        status: newStatus,
        admin_comments: failureMessage || null
    };

    console.log('Updating request status:', { requestId: currentRequestOverride.id, ...requestData });

    fetch(`/api/admin/requests/${currentRequestOverride.id}/status`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(requestData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Status update response:', data);
        showMessage(`Request status updated to ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}!`, 'success');
        $('#statusOverrideModal').modal('hide');
        refreshRequestOverride();
    })
    .catch(error => {
        console.error('Error updating request status:', error);
        showMessage('Error updating status: ' + error.message, 'error');
    });
}

// Initialize tooltips when request override tab is shown
$(document).ready(function() {
    $('#request-override-tab').on('shown.bs.tab', function() {
        refreshRequestOverride();

        // Initialize custom tooltips
        setTimeout(() => {
            initializeCustomTooltips();
        }, 100);
    });

    // Initialize custom tooltips for admin area too
    setTimeout(() => {
        initializeCustomTooltips();
    }, 100);
});

// Function to switch trends period (daily/monthly)
function switchTrendsPeriod(period) {
    currentTrendsPeriod = period;

    // Update button states
    if (period === 'daily') {
        $('#daily-trends-btn').addClass('active');
        $('#monthly-trends-btn').removeClass('active');
        $('#trends-title').text('Daily Trends');
    } else {
        $('#monthly-trends-btn').addClass('active');
        $('#daily-trends-btn').removeClass('active');
        $('#trends-title').text('Monthly Trends');
    }

    // Reload just the trends chart
    if ($('#admin-dashboard').hasClass('active')) {
        showLoadingSpinner();
        fetch(`${API_BASE_URL}/admin/trends?period=${currentTrendsPeriod}`)
            .then(r => r.json())
            .then(trends => {
                updateAdminTrendsChart(trends);
                hideLoadingSpinner();
            })
            .catch(error => {
                console.error('Error loading trends:', error);
                hideLoadingSpinner();
                showErrorMessage('Load Error', 'Failed to load trends data');
            });
    }
}

// Simple custom tooltip implementation
function initializeCustomTooltips() {
    // Remove any existing tooltip elements and event handlers
    $('.custom-tooltip-box').remove();
    $('.custom-tooltip').off('mouseenter.customtooltip mouseleave.customtooltip');

    // Add event listeners to custom tooltip elements with namespace to prevent conflicts
    $('.custom-tooltip').on('mouseenter.customtooltip', function(e) {
        const $this = $(this);
        const tooltipText = $this.attr('data-tooltip');

        if (!tooltipText) return;

        // Remove any existing tooltips first
        $('.custom-tooltip-box').remove();

        // Create tooltip element
        const $tooltip = $('<div class="custom-tooltip-box">')
            .html(tooltipText)
            .css({
                position: 'fixed', // Use fixed positioning to avoid scroll issues
                background: '#333',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                maxWidth: '300px',
                zIndex: 99999, // Very high z-index to stay above everything
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
                opacity: 0,
                fontFamily: 'Arial, sans-serif' // Ensure consistent font
            });

        $('body').append($tooltip);

        // Position tooltip below the element to avoid header conflicts
        const rect = this.getBoundingClientRect();
        const tooltipWidth = $tooltip.outerWidth();
        const tooltipHeight = $tooltip.outerHeight();

        let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        let top = rect.bottom + 10; // Always position below the element

        // Adjust if tooltip goes off screen horizontally
        if (left < 5) left = 5;
        if (left + tooltipWidth > window.innerWidth - 5) {
            left = window.innerWidth - tooltipWidth - 5;
        }

        // If tooltip would go below the visible area, position above
        if (top + tooltipHeight > window.innerHeight - 20) {
            top = rect.top - tooltipHeight - 10;
        }

        $tooltip.css({
            left: left + 'px',
            top: top + 'px'
        });

        // Fade in
        $tooltip.animate({ opacity: 1 }, 200);
    });

    $('.custom-tooltip').on('mouseleave.customtooltip', function() {
        $('.custom-tooltip-box').fadeOut(150, function() {
            $(this).remove();
        });
    });
}